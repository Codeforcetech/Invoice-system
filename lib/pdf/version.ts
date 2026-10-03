export function invoiceDocumentVersion(
  invoiceUpdated: Date,
  settingsUpdated: Date,
  companyUpdated?: Date,
) {
  return `${invoiceUpdated.getTime()}-${settingsUpdated.getTime()}-${companyUpdated?.getTime() ?? 0}`;
}
