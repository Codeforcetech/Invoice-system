-- CreateTable
CREATE TABLE "ClaimWorkspace" (
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ClaimWorkspace_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "ClaimMember" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "entryId" TEXT,
    "paymentEntryId" TEXT,
    "paidDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimReceipt" (
    "claimId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ClaimReceipt_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailStatus" TEXT NOT NULL DEFAULT 'DISABLED',
    "emailPayload" JSONB,
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailFirstAttemptAt" TIMESTAMP(3),
    "emailLastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "ClaimMember_userId_active_idx" ON "ClaimMember"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimMember_ownerId_userId_key" ON "ClaimMember"("ownerId", "userId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_ownerId_status_date_idx" ON "ExpenseClaim"("ownerId", "status", "date");

-- CreateIndex
CREATE INDEX "ExpenseClaim_applicantId_updatedAt_idx" ON "ExpenseClaim"("applicantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClaimEvent_claimId_createdAt_idx" ON "ClaimEvent"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_userId_createdAt_idx" ON "AppNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_emailStatus_createdAt_idx" ON "AppNotification"("emailStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppNotification_userId_eventKey_key" ON "AppNotification"("userId", "eventKey");

-- AddForeignKey
ALTER TABLE "ClaimWorkspace" ADD CONSTRAINT "ClaimWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimMember" ADD CONSTRAINT "ClaimMember_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ClaimWorkspace"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimMember" ADD CONSTRAINT "ClaimMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ClaimWorkspace"("ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_entry_owner_fkey" FOREIGN KEY ("ownerId", "entryId") REFERENCES "JournalEntry"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_payment_owner_fkey" FOREIGN KEY ("ownerId", "paymentEntryId") REFERENCES "JournalEntry"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimReceipt" ADD CONSTRAINT "ClaimReceipt_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvent" ADD CONSTRAINT "ClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvent" ADD CONSTRAINT "ClaimEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClaimMember" ADD CONSTRAINT "ClaimMember_role_check" CHECK ("role" IN ('SUBMITTER','APPROVER'));
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_status_check" CHECK ("status" IN ('DRAFT','PENDING','APPROVED','REJECTED','PAID'));
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_entry_check" CHECK (("status" IN ('APPROVED','PAID')) = ("entryId" IS NOT NULL));
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_payment_check" CHECK (("status" = 'PAID') = ("paymentEntryId" IS NOT NULL AND "paidDate" IS NOT NULL));
