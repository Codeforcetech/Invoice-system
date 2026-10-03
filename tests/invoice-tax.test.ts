import { describe, expect, it } from "vitest";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { hasReducedRate, invoiceTaxGroups } from "@/lib/invoice/taxBreakdown";
import type { InvoiceItemCalcInput } from "@/lib/invoice/types";

// The calculation as it was before tax categories existed. Invoices without any
// category must keep producing exactly these amounts.
function legacy(
  items: InvoiceItemCalcInput[],
  rate: number,
  withholding: boolean,
) {
  const subtotal = Math.floor(
    items.reduce(
      (s, i) =>
        s +
        Math.floor(
          i.amountManuallyEdited ? i.amount : i.quantity * i.unitPrice,
        ),
      0,
    ),
  );
  const taxAmount = Math.floor((subtotal * rate) / 10000);
  const totalWithTax = subtotal + taxAmount;
  const withholdingTax = withholding
    ? Math.floor((subtotal * 1021) / 10000)
    : 0;
  return {
    subtotal,
    taxAmount,
    totalWithTax,
    withholdingTax,
    grandTotal: totalWithTax - withholdingTax,
  };
}
const item = (
  amount: number,
  taxCategory?: string | null,
): InvoiceItemCalcInput => ({
  quantity: 1,
  unitPrice: amount,
  amount,
  amountManuallyEdited: false,
  taxCategory,
});
const calc = (
  items: InvoiceItemCalcInput[],
  rate = 1000,
  withholdingEnabled = false,
) => calculateInvoice({ items, taxRateBps: rate, withholdingEnabled });
const pick = (r: ReturnType<typeof calc>) => ({
  subtotal: r.subtotal,
  taxAmount: r.taxAmount,
  totalWithTax: r.totalWithTax,
  withholdingTax: r.withholdingTax,
  grandTotal: r.grandTotal,
});

// Small deterministic generator so failures are reproducible.
function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

describe("invoices without tax categories are unchanged", () => {
  it("matches the previous calculation for many random invoices and rates", () => {
    const r = rng(7);
    for (let n = 0; n < 500; n++) {
      const items: InvoiceItemCalcInput[] = Array.from(
        { length: 1 + Math.floor(r() * 6) },
        () => {
          const manual = r() < 0.2;
          return {
            quantity: Math.round(r() * 5000) / 100,
            unitPrice: Math.floor(r() * 200000),
            amount: Math.floor(r() * 300000),
            amountManuallyEdited: manual,
            taxCategory: r() < 0.5 ? null : undefined,
          };
        },
      );
      const rate = [1000, 800, 0, 500, 1234][Math.floor(r() * 5)];
      const withholding = r() < 0.3;
      expect(pick(calc(items, rate, withholding))).toEqual(
        legacy(items, rate, withholding),
      );
    }
  });

  it("reports one group at the invoice's rate", () => {
    const r = calc([item(1001), item(999)], 1000);
    expect(r.taxGroups).toHaveLength(1);
    expect(r.taxGroups[0]).toMatchObject({
      label: "10%",
      subtotal: 2000,
      taxAmount: 200,
      total: 2200,
    });
  });
});

describe("invoices with tax categories", () => {
  it("gives the same amounts as before when every line is at the invoice's rate", () => {
    const r = rng(11);
    for (let n = 0; n < 300; n++) {
      const amounts = Array.from({ length: 1 + Math.floor(r() * 6) }, () =>
        Math.floor(r() * 500000),
      );
      const plain = calc(
        amounts.map((a) => item(a)),
        1000,
      );
      const tagged = calc(
        amounts.map((a) => item(a, "TAXABLE_10")),
        1000,
      );
      expect(pick(tagged)).toEqual(pick(plain));
    }
  });

  it("rounds each rate once: 10% and reduced 8% on one invoice", () => {
    const r = calc([item(1001, "TAXABLE_10"), item(999, "TAXABLE_8")], 1000);
    expect(
      r.taxGroups.map((g) => [g.label, g.subtotal, g.taxAmount, g.total]),
    ).toEqual([
      ["10%", 1001, 100, 1101],
      ["軽減8%※", 999, 79, 1078],
    ]);
    expect(r.subtotal).toBe(2000);
    expect(r.taxAmount).toBe(179);
    expect(r.totalWithTax).toBe(2179);
  });

  it("rounds per rate, not per line", () => {
    const r = calc(
      [item(15, "TAXABLE_10"), item(15, "TAXABLE_10"), item(15, "TAXABLE_10")],
      1000,
    );
    expect(r.taxAmount).toBe(4); // floor(45 × 10%), not 3 × floor(1.5)
  });

  it("charges no tax on exempt, tax-free and non-taxable lines and lists them separately", () => {
    const r = calc(
      [
        item(1000, "TAXABLE_10"),
        item(500, "EXEMPT"),
        item(300, "NON_TAXABLE"),
        item(200, "TAX_FREE"),
      ],
      1000,
    );
    expect(r.taxGroups.map((g) => [g.label, g.taxAmount])).toEqual([
      ["10%", 100],
      ["非課税", 0],
      ["免税", 0],
      ["不課税", 0],
    ]);
    expect(r.subtotal).toBe(2000);
    expect(r.taxAmount).toBe(100);
  });

  it("lines without a category join the group of the invoice's rate", () => {
    const r = calc([item(1000, null), item(500, "TAXABLE_10")], 1000);
    expect(r.taxGroups).toHaveLength(1);
    expect(r.taxGroups[0]).toMatchObject({
      label: "10%",
      subtotal: 1500,
      taxAmount: 150,
    });
    const r8 = calc([item(1000, null), item(500, "TAXABLE_8")], 800);
    expect(r8.taxGroups).toHaveLength(1);
    expect(r8.taxGroups[0].label).toBe("軽減8%※");
  });

  it("keeps an unusual invoice rate as its own group", () => {
    const r = calc([item(1000, null), item(1000, "TAXABLE_10")], 500);
    expect(r.taxGroups.map((g) => [g.label, g.taxAmount])).toEqual([
      ["10%", 100],
      ["5%", 50],
    ]);
  });

  it("applies withholding to the total before tax, as before", () => {
    const r = calc(
      [item(100000, "TAXABLE_10"), item(50000, "TAXABLE_8")],
      1000,
      true,
    );
    expect(r.withholdingTax).toBe(Math.floor((150000 * 1021) / 10000));
    expect(r.grandTotal).toBe(r.totalWithTax - r.withholdingTax);
  });

  it("the group totals always add up to the invoice totals", () => {
    const r = rng(23);
    const cats = [
      "TAXABLE_10",
      "TAXABLE_8",
      "EXEMPT",
      "NON_TAXABLE",
      "TAX_FREE",
      null,
    ];
    for (let n = 0; n < 300; n++) {
      const items = Array.from({ length: 1 + Math.floor(r() * 8) }, () =>
        item(Math.floor(r() * 400000), cats[Math.floor(r() * cats.length)]),
      );
      const c = calc(items, [1000, 800][Math.floor(r() * 2)]);
      expect(c.taxGroups.reduce((s, g) => s + g.subtotal, 0)).toBe(c.subtotal);
      expect(c.taxGroups.reduce((s, g) => s + g.taxAmount, 0)).toBe(
        c.taxAmount,
      );
      expect(c.taxGroups.reduce((s, g) => s + g.total, 0)).toBe(c.totalWithTax);
    }
  });

  it("treats an unknown category as unset", () => {
    expect(pick(calc([item(1001, "TAXABLE_5")], 1000))).toEqual(
      legacy([item(1001)], 1000, false),
    );
  });
});

describe("tax groups for display", () => {
  const stored = (
    items: { amount: number; taxCategory?: string | null }[],
    rate: number,
  ) => {
    const c = calc(
      items.map((i) => item(i.amount, i.taxCategory)),
      rate,
    );
    return {
      taxRate: rate,
      subtotal: c.subtotal,
      taxAmount: c.taxAmount,
      items,
    };
  };

  it("shows the stored totals as one group for an invoice without categories", () => {
    const g = invoiceTaxGroups({
      taxRate: 1000,
      subtotal: 2000,
      taxAmount: 200,
      items: [{ amount: 2000 }],
    });
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      label: "10%",
      subtotal: 2000,
      taxAmount: 200,
      total: 2200,
    });
    expect(hasReducedRate(g)).toBe(false);
  });

  it("rebuilds the groups from the stored lines when categories exist", () => {
    const g = invoiceTaxGroups(
      stored(
        [
          { amount: 1001, taxCategory: "TAXABLE_10" },
          { amount: 999, taxCategory: "TAXABLE_8" },
        ],
        1000,
      ),
    );
    expect(g.map((x) => x.label)).toEqual(["10%", "軽減8%※"]);
    expect(hasReducedRate(g)).toBe(true);
  });

  it("falls back to the stored single line if the lines no longer add up to the stored totals", () => {
    const base = stored(
      [
        { amount: 1001, taxCategory: "TAXABLE_10" },
        { amount: 999, taxCategory: "TAXABLE_8" },
      ],
      1000,
    );
    const g = invoiceTaxGroups({ ...base, taxAmount: base.taxAmount + 1 });
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      subtotal: base.subtotal,
      taxAmount: base.taxAmount + 1,
    });
  });
});
