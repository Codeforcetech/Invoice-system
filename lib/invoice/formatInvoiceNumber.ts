/** 一覧表示用：ユーザーID接頭辞を除いた短い番号（例: MEDIALAB-202606-001） */
export function formatInvoiceNumberCompact(invoiceNumber: string): string {
  const parts = invoiceNumber.split("-");
  if (parts.length >= 4) return parts.slice(-3).join("-");
  return invoiceNumber;
}
