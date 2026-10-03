-- Optional tax category on journal lines and on payments (expenses). NULL means "not set":
-- every existing line and payment stays as it is, and no amount or balance changes.
ALTER TABLE "JournalLine" ADD COLUMN "taxCategory" TEXT;
ALTER TABLE "Expense" ADD COLUMN "taxCategory" TEXT;

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_taxCategory_check"
  CHECK ("taxCategory" IS NULL OR "taxCategory" IN ('TAXABLE_10', 'TAXABLE_8', 'EXEMPT', 'NON_TAXABLE', 'TAX_FREE'));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_taxCategory_check"
  CHECK ("taxCategory" IS NULL OR "taxCategory" IN ('TAXABLE_10', 'TAXABLE_8', 'EXEMPT', 'NON_TAXABLE', 'TAX_FREE'));
