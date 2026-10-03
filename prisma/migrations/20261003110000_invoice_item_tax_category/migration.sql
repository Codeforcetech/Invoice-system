-- Optional per-line tax category. NULL keeps the existing behavior (the invoice's tax rate applies),
-- so no existing invoice, line or amount changes.
ALTER TABLE "InvoiceItem" ADD COLUMN "taxCategory" TEXT;

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_taxCategory_check"
  CHECK ("taxCategory" IS NULL OR "taxCategory" IN ('TAXABLE_10', 'TAXABLE_8', 'EXEMPT', 'NON_TAXABLE', 'TAX_FREE'));
