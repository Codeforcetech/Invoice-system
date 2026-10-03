export type InvoiceItemCalcInput = {
  quantity: number; // UI側で number に正規化（保存時はサーバーで再検証）
  unitPrice: number; // 円
  amount: number; // 円（手修正時に使用）
  amountManuallyEdited: boolean;
  /** 消費税区分。未設定（null/undefined）なら請求書の税率を引き継ぐ（従来の計算） */
  taxCategory?: string | null;
};

/** 税率（区分）ごとの集計。インボイスの「税率ごとに区分した合計額と税額」に使う */
export type TaxGroup = {
  /** 同じ区分・税率をまとめるキー */
  key: string;
  /** 表示用の短い名称（例: 10%、軽減8%※、非課税） */
  label: string;
  rateBps: number;
  taxable: boolean;
  /** 軽減税率の対象（※を付ける） */
  reduced: boolean;
  subtotal: number; // 税抜
  taxAmount: number;
  total: number; // 税込
};

export type CalculateInvoiceInput = {
  items: InvoiceItemCalcInput[];
  taxRateBps: number; // 例: 10.00% => 1000（%*100）
  withholdingEnabled: boolean;
};

export type CalculateInvoiceResult = {
  subtotal: number;
  taxAmount: number;
  totalWithTax: number;
  withholdingTax: number;
  grandTotal: number;
  /** 税率ごとの内訳。区分が未設定の請求書では税率1つの1行 */
  taxGroups: TaxGroup[];
};
