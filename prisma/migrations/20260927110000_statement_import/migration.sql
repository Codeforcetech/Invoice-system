-- CreateTable
CREATE TABLE "StatementFeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementRow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "entryId" TEXT,
    "decision" TEXT,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "descriptionKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "counterAccountId" TEXT NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementFeed_userId_id_key" ON "StatementFeed"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StatementFeed_userId_name_key" ON "StatementFeed"("userId", "name");

-- CreateIndex
CREATE INDEX "StatementRow_userId_feedId_status_date_idx" ON "StatementRow"("userId", "feedId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StatementRow_feedId_entryId_key" ON "StatementRow"("feedId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementRow_userId_feedId_fingerprint_key" ON "StatementRow"("userId", "feedId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "StatementRule_userId_feedId_descriptionKey_direction_key" ON "StatementRule"("userId", "feedId", "descriptionKey", "direction");

-- AddForeignKey
ALTER TABLE "StatementFeed" ADD CONSTRAINT "StatementFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementFeed" ADD CONSTRAINT "StatementFeed_userId_accountId_fkey" FOREIGN KEY ("userId", "accountId") REFERENCES "Account"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementRow" ADD CONSTRAINT "StatementRow_userId_feedId_fkey" FOREIGN KEY ("userId", "feedId") REFERENCES "StatementFeed"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementRow" ADD CONSTRAINT "StatementRow_userId_entryId_fkey" FOREIGN KEY ("userId", "entryId") REFERENCES "JournalEntry"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementRule" ADD CONSTRAINT "StatementRule_userId_feedId_fkey" FOREIGN KEY ("userId", "feedId") REFERENCES "StatementFeed"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementRule" ADD CONSTRAINT "StatementRule_userId_counterAccountId_fkey" FOREIGN KEY ("userId", "counterAccountId") REFERENCES "Account"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StatementFeed" ADD CONSTRAINT "StatementFeed_kind_check" CHECK ("kind" IN ('BANK', 'CARD'));
ALTER TABLE "StatementRow" ADD CONSTRAINT "StatementRow_amount_check" CHECK ("amount" <> 0);
ALTER TABLE "StatementRow" ADD CONSTRAINT "StatementRow_status_check" CHECK ("status" IN ('PENDING', 'POSTED', 'LINKED', 'IGNORED'));
ALTER TABLE "StatementRow" ADD CONSTRAINT "StatementRow_entry_check" CHECK (("status" IN ('POSTED','LINKED')) = ("entryId" IS NOT NULL));
ALTER TABLE "StatementRule" ADD CONSTRAINT "StatementRule_direction_check" CHECK ("direction" IN ('IN', 'OUT'));
