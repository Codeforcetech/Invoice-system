import {
  applyRounding,
  BPS_SCALE,
  MONEY_ROUNDING_MODE,
  WITHHOLDING_TAX_RATE_BPS,
} from "./constants";
import {
  isTaxCategory,
  taxCategoryInfo,
  type TaxCategory,
} from "@/lib/tax/categories";
import type {
  CalculateInvoiceInput,
  CalculateInvoiceResult,
  TaxGroup,
} from "./types";

function toYenInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return applyRounding(value, "FLOOR");
}

const ORDER: TaxCategory[] = [
  "TAXABLE_10",
  "TAXABLE_8",
  "EXEMPT",
  "TAX_FREE",
  "NON_TAXABLE",
];

function roundedPercent(rateBps: number) {
  return `${Number((rateBps / 100).toFixed(2))}%`;
}

/** 区分が未設定の明細が、請求書の税率でどの集計に入るか */
function groupFor(category: string | null | undefined, invoiceRateBps: number) {
  if (isTaxCategory(category)) {
    const i = taxCategoryInfo[category];
    return {
      key: category,
      label: i.short,
      rateBps: i.rateBps,
      taxable: i.taxable,
      reduced: i.reduced,
    };
  }
  if (invoiceRateBps === 1000 || invoiceRateBps === 800) {
    const c: TaxCategory = invoiceRateBps === 1000 ? "TAXABLE_10" : "TAXABLE_8";
    const i = taxCategoryInfo[c];
    return {
      key: c,
      label: i.short,
      rateBps: i.rateBps,
      taxable: true,
      reduced: i.reduced,
    };
  }
  return {
    key: `RATE_${invoiceRateBps}`,
    label: roundedPercent(invoiceRateBps),
    rateBps: invoiceRateBps,
    taxable: invoiceRateBps > 0,
    reduced: false,
  };
}

function sortKey(g: { key: string; rateBps: number }) {
  const i = ORDER.indexOf(g.key as TaxCategory);
  // 標準 → 軽減 → その他の税率（高い順）→ 非課税・免税・不課税
  return i >= 0 ? i : 1.5 - g.rateBps / 100000;
}

/**
 * 税率（区分）ごとに税抜額を集計し、各区分で1回だけ端数処理して税額を出す。
 * 同じ税率の明細は区分の指定の有無にかかわらず同じ集計になる。
 */
export function groupTaxes(
  lines: { amount: number; taxCategory?: string | null }[],
  invoiceRateBps: number,
): TaxGroup[] {
  const groups = new Map<string, TaxGroup>();
  for (const line of lines) {
    const g = groupFor(line.taxCategory, invoiceRateBps);
    const cur = groups.get(g.key) ?? {
      ...g,
      subtotal: 0,
      taxAmount: 0,
      total: 0,
    };
    cur.subtotal += toYenInt(line.amount);
    groups.set(g.key, cur);
  }
  return [...groups.values()]
    .map((g) => {
      const taxAmount = g.taxable
        ? toYenInt(
            applyRounding(
              (g.subtotal * g.rateBps) / BPS_SCALE,
              MONEY_ROUNDING_MODE,
            ),
          )
        : 0;
      return { ...g, taxAmount, total: g.subtotal + taxAmount };
    })
    .sort((a, b) => sortKey(a) - sortKey(b));
}

export function hasTaxCategories(lines: { taxCategory?: string | null }[]) {
  return lines.some((l) => isTaxCategory(l.taxCategory));
}

export function calculateInvoice(
  input: CalculateInvoiceInput,
): CalculateInvoiceResult {
  const amounts = input.items.map((item) => {
    const autoAmount = item.quantity * item.unitPrice;
    const amount = item.amountManuallyEdited ? item.amount : autoAmount;
    return { amount: toYenInt(amount), taxCategory: item.taxCategory };
  });
  const subtotal = toYenInt(amounts.reduce((sum, a) => sum + a.amount, 0));

  let taxAmount: number;
  let taxGroups: TaxGroup[];
  if (hasTaxCategories(amounts)) {
    // 区分が付いた請求書だけ、税率ごとに1回ずつ端数処理する。
    taxGroups = groupTaxes(amounts, input.taxRateBps);
    taxAmount = taxGroups.reduce((sum, g) => sum + g.taxAmount, 0);
  } else {
    // 区分が1つもない従来の請求書: 全体に1回（従来と同じ金額）。
    taxAmount = toYenInt(
      applyRounding(
        (subtotal * input.taxRateBps) / BPS_SCALE,
        MONEY_ROUNDING_MODE,
      ),
    );
    taxGroups = [
      {
        ...groupFor(null, input.taxRateBps),
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
      },
    ];
  }

  const totalWithTax = subtotal + taxAmount;

  const withholdingTax = input.withholdingEnabled
    ? toYenInt(
        applyRounding(
          (subtotal * WITHHOLDING_TAX_RATE_BPS) / BPS_SCALE,
          MONEY_ROUNDING_MODE,
        ),
      )
    : 0;

  const grandTotal = totalWithTax - withholdingTax;

  return {
    subtotal,
    taxAmount,
    totalWithTax,
    withholdingTax,
    grandTotal,
    taxGroups,
  };
}
