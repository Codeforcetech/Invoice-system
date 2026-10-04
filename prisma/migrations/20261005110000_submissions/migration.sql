-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "submissionId" TEXT;

-- CreateTable
CREATE TABLE "SubmitterProfile" (
    "userId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "registrationNumber" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "branchName" TEXT NOT NULL DEFAULT '',
    "accountType" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "accountHolder" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmitterProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "senderName" TEXT NOT NULL DEFAULT '',
    "senderAddress" TEXT NOT NULL DEFAULT '',
    "senderRegistration" TEXT NOT NULL DEFAULT '',
    "senderBank" TEXT NOT NULL DEFAULT '',
    "rejectReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxCategory" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SubmissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionEvent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_ownerId_status_month_idx" ON "Submission"("ownerId", "status", "month");

-- CreateIndex
CREATE INDEX "Submission_submitterId_updatedAt_idx" ON "Submission"("submitterId", "updatedAt");

-- CreateIndex
CREATE INDEX "SubmissionItem_submissionId_idx" ON "SubmissionItem"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionFile_submissionId_idx" ON "SubmissionFile"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionEvent_submissionId_createdAt_idx" ON "SubmissionEvent"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_submissionId_idx" ON "Expense"("submissionId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmitterProfile" ADD CONSTRAINT "SubmitterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionItem" ADD CONSTRAINT "SubmissionItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEvent" ADD CONSTRAINT "SubmissionEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 値の範囲は、アプリだけでなくデータベースでも守る。
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_status_check"
  CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'));
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_month_check"
  CHECK ("month" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_amounts_check"
  CHECK ("subtotal" >= 0 AND "taxAmount" >= 0 AND "total" = "subtotal" + "taxAmount");
ALTER TABLE "SubmissionItem" ADD CONSTRAINT "SubmissionItem_kind_check"
  CHECK ("kind" IN ('REWARD', 'TRANSPORT', 'EXPENSE'));
ALTER TABLE "SubmissionItem" ADD CONSTRAINT "SubmissionItem_tax_check"
  CHECK ("taxCategory" IN ('TAXABLE_10', 'TAXABLE_8', 'EXEMPT', 'NON_TAXABLE', 'TAX_FREE'));
ALTER TABLE "SubmissionItem" ADD CONSTRAINT "SubmissionItem_amounts_check"
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "amount" >= 0);
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_size_check"
  CHECK ("size" > 0);
