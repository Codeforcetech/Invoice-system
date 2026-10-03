-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "receiptMatchId" TEXT,
ADD COLUMN     "recurringKey" TEXT;

-- CreateTable
CREATE TABLE "AccountingSource" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "entryId" TEXT,

    CONSTRAINT "AccountingSource_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "ReceiptMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "payer" TEXT NOT NULL,
    "invoiceIds" JSONB NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "nextMonth" TEXT NOT NULL,
    "issueDay" INTEGER NOT NULL,
    "dueDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceiptMatch_userId_createdAt_idx" ON "ReceiptMatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecurringInvoice_userId_active_nextMonth_idx" ON "RecurringInvoice"("userId", "active", "nextMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_recurringKey_key" ON "Invoice"("recurringKey");

