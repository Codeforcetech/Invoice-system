-- Additive only. No changes to existing invoices, accounts or customers.
CREATE TABLE "FixedAsset" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "acquiredDate" DATE NOT NULL, "serviceDate" DATE NOT NULL,
 "cost" INTEGER NOT NULL, "usefulLife" INTEGER NOT NULL, "method" TEXT NOT NULL,
 "fiscalStartMonth" INTEGER NOT NULL DEFAULT 1,
 "assetAccountId" TEXT NOT NULL, "expenseAccountId" TEXT NOT NULL,
 "note" TEXT NOT NULL DEFAULT '', "archived" BOOLEAN NOT NULL DEFAULT false,
 "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FixedAsset_values_check" CHECK (
  "cost" > 0 AND "usefulLife" BETWEEN 2 AND 50 AND "fiscalStartMonth" BETWEEN 1 AND 12
  AND "method" IN ('STRAIGHT', 'DECLINING', 'NONE') AND "serviceDate" >= "acquiredDate"
  AND "revision" >= 0
 )
);
CREATE TABLE "DepreciationPosting" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
 "entryId" TEXT NOT NULL, "month" TEXT NOT NULL, "amount" INTEGER NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "canceledReason" TEXT, "canceledAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DepreciationPosting_values_check" CHECK (
  "amount" > 0 AND "month" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
  AND (("active" AND "canceledAt" IS NULL AND "canceledReason" IS NULL)
    OR (NOT "active" AND "canceledAt" IS NOT NULL AND length(trim("canceledReason")) > 0))
 )
);
CREATE INDEX "FixedAsset_userId_archived_createdAt_idx" ON "FixedAsset"("userId", "archived", "createdAt");
CREATE UNIQUE INDEX "FixedAsset_userId_id_key" ON "FixedAsset"("userId", "id");
CREATE INDEX "DepreciationPosting_userId_assetId_active_month_idx" ON "DepreciationPosting"("userId", "assetId", "active", "month");
CREATE UNIQUE INDEX "DepreciationPosting_assetId_month_entryId_key" ON "DepreciationPosting"("assetId", "month", "entryId");
-- Monthly and yearly postings share the same uniqueness boundary.
CREATE UNIQUE INDEX "DepreciationPosting_active_month_key" ON "DepreciationPosting"("assetId", "month") WHERE "active";
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_userId_assetAccountId_fkey" FOREIGN KEY ("userId", "assetAccountId") REFERENCES "Account"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_userId_expenseAccountId_fkey" FOREIGN KEY ("userId", "expenseAccountId") REFERENCES "Account"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepreciationPosting" ADD CONSTRAINT "DepreciationPosting_userId_assetId_fkey" FOREIGN KEY ("userId", "assetId") REFERENCES "FixedAsset"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepreciationPosting" ADD CONSTRAINT "DepreciationPosting_userId_entryId_fkey" FOREIGN KEY ("userId", "entryId") REFERENCES "JournalEntry"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
