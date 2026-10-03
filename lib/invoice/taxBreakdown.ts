import { groupTaxes, hasTaxCategories } from "./calculateInvoice";
import { isTaxCategory, taxCategoryInfo } from "@/lib/tax/categories";
import type { TaxGroup } from "./types";

/**
 * 請求書の表示（画面・PDF・共有ページ）に使う税率別の内訳。
 * 区分が付いた明細があるときは、保存済みの明細から再計算する。再計算した合計が
 * 保存済みの小計・税額と合わないときは、従来どおり税率1つの1行に戻す。
 */
export function invoiceTaxGroups(invoice: {
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  totalWithTax?: number;
  items: { amount: number; taxCategory?: string | null }[];
}): TaxGroup[] {
  const legacy = (): TaxGroup[] => {
    const [g] = groupTaxes([{ amount: invoice.subtotal }], invoice.taxRate);
    return [
      {
        ...g,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        total: invoice.subtotal + invoice.taxAmount,
      },
    ];
  };
  if (!hasTaxCategories(invoice.items)) return legacy();
  const groups = groupTaxes(invoice.items, invoice.taxRate);
  const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const tax = groups.reduce((s, g) => s + g.taxAmount, 0);
  return subtotal === invoice.subtotal && tax === invoice.taxAmount
    ? groups
    : legacy();
}

/** 軽減税率の対象を含むか（「※は軽減税率対象」の凡例を出す） */
export function hasReducedRate(groups: TaxGroup[]) {
  return groups.some((g) => g.reduced && g.subtotal > 0);
}

/**
 * 明細の税区分の表記。軽減税率の明細には「※」、非課税・免税・不課税の明細には区分名を付ける。
 * 区分が1つもない従来の請求書では何も付けない（従来の表示のまま）。
 */
export function itemTaxMark(
  item: { taxCategory?: string | null },
  invoice: { taxRate: number; items: { taxCategory?: string | null }[] },
): { reduced: boolean; note: string | null } {
  if (!hasTaxCategories(invoice.items)) return { reduced: false, note: null };
  if (!isTaxCategory(item.taxCategory))
    return { reduced: invoice.taxRate === 800, note: null };
  const info = taxCategoryInfo[item.taxCategory];
  return { reduced: info.reduced, note: info.taxable ? null : info.short };
}
