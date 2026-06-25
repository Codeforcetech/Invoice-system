export function buildInvoiceSharePath(token: string): string {
  return `/share/invoices/${token}`;
}

export function buildInvoiceShareUrl(base: string, token: string): string {
  const normalized = base.replace(/\/$/, "");
  const path = buildInvoiceSharePath(token);
  return normalized ? `${normalized}${path}` : path;
}
