import {
  TAX_CATEGORIES,
  isTaxCategory,
  taxCategoryInfo,
  type TaxCategory,
} from "@/lib/tax/categories";

/** One aggregated group of journal lines: an account kind and a tax category. */
export type TaxLineGroup = {
  kind: string; // ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  taxCategory: string | null;
  debit: number;
  credit: number;
};

export const taxReportHeaders = [
  "種別",
  "消費税区分",
  "税込金額",
  "税抜金額",
  "消費税額",
];

/** PDF（A4横）の列幅。長い注記の行が読める幅を2列目に取る。 */
export const taxReportPdfWidths = [80, 340, 115, 115, 115];

export const TAX_REPORT_NOTE =
  "税込経理で記帳した金額を、区分ごとに税込から割り戻した参考値です（円未満切り捨て）。個々の請求書の税額と1円単位で一致しない場合があります。申告書の税額計算には使用せず、税理士・国税庁の定めに従って確認してください。";

type Side = "SALES" | "PURCHASES";
const sideLabel: Record<Side, string> = {
  SALES: "売上",
  PURCHASES: "仕入・経費",
};

/** 税込金額から税額を割り戻す。負の金額（取消・返品）も符号を保って計算する。 */
export function backOutTax(gross: number, rateBps: number) {
  if (rateBps <= 0) return 0;
  return (
    Math.sign(gross) *
    Math.floor((Math.abs(gross) * rateBps) / (10000 + rateBps))
  );
}

/**
 * 売上は収益科目の貸方−借方、仕入・経費は費用科目と資産科目（設備などの取得）の借方−貸方。
 * 資産・負債・純資産の行は、区分が付いたものだけを仕入側に数える（預金・売掛金などの行は対象外）。
 * 収益・費用の行で区分がないものは「未設定」として別に示す。
 */
export function buildTaxRows(groups: TaxLineGroup[]): (string | number)[][] {
  const totals = new Map<string, number>();
  const add = (side: Side, cat: string, amount: number) =>
    totals.set(`${side}:${cat}`, (totals.get(`${side}:${cat}`) ?? 0) + amount);
  for (const g of groups) {
    const cat = isTaxCategory(g.taxCategory) ? g.taxCategory : null;
    if (g.kind === "REVENUE") add("SALES", cat ?? "UNSET", g.credit - g.debit);
    else if (g.kind === "EXPENSE")
      add("PURCHASES", cat ?? "UNSET", g.debit - g.credit);
    else if (g.kind === "ASSET" && cat)
      add("PURCHASES", cat, g.debit - g.credit);
  }
  const rows: (string | number)[][] = [];
  for (const side of ["SALES", "PURCHASES"] as Side[]) {
    let gross = 0;
    let net = 0;
    let tax = 0;
    for (const c of TAX_CATEGORIES as readonly TaxCategory[]) {
      const g = totals.get(`${side}:${c}`);
      if (g === undefined) continue;
      const info = taxCategoryInfo[c];
      const t = info.taxable ? backOutTax(g, info.rateBps) : 0;
      rows.push([sideLabel[side], info.label, g, g - t, t]);
      gross += g;
      net += g - t;
      tax += t;
    }
    rows.push([sideLabel[side], "区分ありの合計", gross, net, tax]);
    const unset = totals.get(`${side}:UNSET`);
    rows.push([
      sideLabel[side],
      "未設定（区分を指定していない取引）",
      unset ?? 0,
      "",
      "",
    ]);
  }
  rows.push(["注", TAX_REPORT_NOTE, "", "", ""]);
  return rows;
}
