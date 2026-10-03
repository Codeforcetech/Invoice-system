/**
 * 消費税の区分。税率は bps（10% = 1000）。
 * 明細の区分が未設定（null）のときは、従来どおり請求書の税率を引き継ぐ。
 */
export const TAX_CATEGORIES = [
  "TAXABLE_10",
  "TAXABLE_8",
  "EXEMPT",
  "NON_TAXABLE",
  "TAX_FREE",
] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

type Info = {
  /** 画面での名称 */
  label: string;
  /** 請求書の明細・内訳での短い表記 */
  short: string;
  /** 税率（bps）。課税のとき以外は 0 */
  rateBps: number;
  /** 消費税が課される取引か */
  taxable: boolean;
  /** 軽減税率の対象（請求書に「※」を付ける） */
  reduced: boolean;
  description: string;
};

export const taxCategoryInfo: Record<TaxCategory, Info> = {
  TAXABLE_10: {
    label: "課税（10%）",
    short: "10%",
    rateBps: 1000,
    taxable: true,
    reduced: false,
    description: "標準税率の課税取引",
  },
  TAXABLE_8: {
    label: "課税（軽減8%）",
    short: "軽減8%※",
    rateBps: 800,
    taxable: true,
    reduced: true,
    description: "飲食料品・新聞の定期購読など、軽減税率の課税取引",
  },
  EXEMPT: {
    label: "非課税",
    short: "非課税",
    rateBps: 0,
    taxable: false,
    reduced: false,
    description:
      "土地の譲渡・貸付、保険料、利子など、消費税の性格になじまない取引",
  },
  TAX_FREE: {
    label: "免税",
    short: "免税",
    rateBps: 0,
    taxable: false,
    reduced: false,
    description: "輸出取引など、0%で課税される取引",
  },
  NON_TAXABLE: {
    label: "不課税",
    short: "不課税",
    rateBps: 0,
    taxable: false,
    reduced: false,
    description: "給与・寄附など、消費税の課税対象外の取引",
  },
};

export function isTaxCategory(value: unknown): value is TaxCategory {
  return (
    typeof value === "string" &&
    (TAX_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * 明細に適用する税率（bps）。区分が未設定なら請求書の税率を使う。
 * 未知の値は未設定として扱い、金額が変わらないようにする。
 */
export function effectiveRateBps(
  category: string | null | undefined,
  invoiceRateBps: number,
): number {
  return isTaxCategory(category)
    ? taxCategoryInfo[category].rateBps
    : invoiceRateBps;
}
