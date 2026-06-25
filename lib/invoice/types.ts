export type InvoiceItemCalcInput = {
  quantity: number; // UI側で number に正規化（保存時はサーバーで再検証）
  unitPrice: number; // 円
  amount: number; // 円（手修正時に使用）
  amountManuallyEdited: boolean;
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
};

