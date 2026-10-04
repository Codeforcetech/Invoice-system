import { describe, expect, it } from "vitest";
import {
  expenseGroups,
  itemAmount,
  needsReceipt,
  profileSchema,
  submissionSchema,
  submissionTotals,
  taxGroups,
} from "@/lib/submissions/model";

const item = (over: Record<string, unknown> = {}) => ({
  kind: "REWARD",
  name: "9月分 業務委託料",
  quantity: 1,
  unitPrice: 100000,
  taxCategory: "TAXABLE_10",
  note: "",
  ...over,
});

describe("submission amounts", () => {
  it("multiplies quantity by price and rounds to whole yen", () => {
    expect(itemAmount(1, 100000)).toBe(100000);
    expect(itemAmount(2.5, 1001)).toBe(2503); // 2502.5 → 2503
    expect(itemAmount(0.5, 3)).toBe(2);
  });
  it("adds tax per tax category; non-taxable (交通費) adds none", () => {
    const t = submissionTotals([
      { quantity: 1, unitPrice: 100000, taxCategory: "TAXABLE_10" },
      { quantity: 1, unitPrice: 20000, taxCategory: "EXEMPT" },
      { quantity: 1, unitPrice: 999, taxCategory: "TAXABLE_8" },
    ]);
    expect(t.subtotal).toBe(120999);
    expect(t.taxAmount).toBe(10000 + 79); // 8% of 999 = 79.92 → 79
    expect(t.total).toBe(t.subtotal + t.taxAmount);
    expect(t.groups.find((g) => g.taxCategory === "EXEMPT")).toMatchObject(
      { net: 20000, tax: 0 },
    );
  });
  it("rounds tax once per tax category, not per line", () => {
    const g = taxGroups([
      { amount: 15, taxCategory: "TAXABLE_10" },
      { amount: 15, taxCategory: "TAXABLE_10" },
    ]);
    expect(g).toEqual([{ taxCategory: "TAXABLE_10", net: 30, tax: 3 }]);
  });
});

describe("what approval turns into", () => {
  it("makes one payment per kind and tax category, with the right expense category and gross amount", () => {
    const groups = expenseGroups([
      { kind: "REWARD", name: "A", amount: 100000, taxCategory: "TAXABLE_10" },
      { kind: "REWARD", name: "B", amount: 50000, taxCategory: "TAXABLE_10" },
      {
        kind: "TRANSPORT",
        name: "電車",
        amount: 3000,
        taxCategory: "EXEMPT",
      },
    ]);
    expect(
      groups.map((g) => [g.category, g.taxCategory, g.net, g.tax, g.gross]),
    ).toEqual([
      ["業務委託報酬", "TAXABLE_10", 150000, 15000, 165000],
      ["交通費", "EXEMPT", 3000, 0, 3000],
    ]);
  });
  it("needs a receipt only when there are expenses besides the fee", () => {
    expect(needsReceipt([{ kind: "REWARD" }])).toBe(false);
    expect(needsReceipt([{ kind: "REWARD" }, { kind: "TRANSPORT" }])).toBe(
      true,
    );
  });
});

describe("input validation", () => {
  const base = {
    id: crypto.randomUUID(),
    month: "2026-09",
    title: "9月分",
    items: [item()],
  };
  it("accepts a normal submission and speaks plainly about mistakes", () => {
    expect(submissionSchema.safeParse(base).success).toBe(true);
    const msg = (over: Record<string, unknown>) => {
      const r = submissionSchema.safeParse({ ...base, ...over });
      return r.success ? "" : r.error.issues[0].message;
    };
    expect(msg({ month: "2026-13" })).toMatch(/何月分/);
    expect(msg({ items: [] })).toMatch(/明細/);
    expect(msg({ title: " " })).toMatch(/件名/);
    expect(msg({ items: [item({ name: "" })] })).toMatch(/項目名/);
    expect(msg({ items: [item({ unitPrice: -1 })] })).toMatch(/0円以上/);
    expect(msg({ items: [item({ unitPrice: 10.5 })] })).toMatch(/整数/);
    expect(msg({ items: [item({ quantity: 0 })] })).toMatch(/0より大きい/);
    expect(msg({ items: [item({ taxCategory: "BOGUS" })] })).toBeTruthy();
  });
  it("checks the invoice registration number format", () => {
    expect(
      profileSchema.safeParse({
        legalName: "山田",
        registrationNumber: "T1234567890123",
      }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ legalName: "山田", registrationNumber: "" })
        .success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ legalName: "山田", registrationNumber: "123" })
        .success,
    ).toBe(false);
    expect(profileSchema.safeParse({ legalName: "" }).success).toBe(false);
  });
});
