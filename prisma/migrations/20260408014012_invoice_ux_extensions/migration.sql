-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingCcEmail" TEXT,
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "commonSubject" TEXT,
ADD COLUMN     "defaultDueDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "paymentTerms" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "autosaveUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InvoiceItemTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceItemTemplate_userId_idx" ON "InvoiceItemTemplate"("userId");

-- CreateIndex
CREATE INDEX "MailTemplate_userId_idx" ON "MailTemplate"("userId");

-- AddForeignKey
ALTER TABLE "InvoiceItemTemplate" ADD CONSTRAINT "InvoiceItemTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailTemplate" ADD CONSTRAINT "MailTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
