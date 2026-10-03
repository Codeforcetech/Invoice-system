-- CreateTable
CREATE TABLE "AccountingSetting" (
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "industry" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSetting_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "reversalOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_code_key" ON "Account"("userId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_id_key" ON "Account"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOf_key" ON "JournalEntry"("reversalOf");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_date_createdAt_idx" ON "JournalEntry"("userId", "date", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_userId_requestKey_key" ON "JournalEntry"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_userId_id_key" ON "JournalEntry"("userId", "id");

-- CreateIndex
CREATE INDEX "JournalLine_userId_accountId_idx" ON "JournalLine"("userId", "accountId");

-- AddForeignKey
ALTER TABLE "AccountingSetting" ADD CONSTRAINT "AccountingSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_userId_entryId_fkey" FOREIGN KEY ("userId", "entryId") REFERENCES "JournalEntry"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_userId_accountId_fkey" FOREIGN KEY ("userId", "accountId") REFERENCES "Account"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_one_side" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));
ALTER TABLE "Account" ADD CONSTRAINT "Account_kind_valid" CHECK ("kind" IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'));
CREATE FUNCTION seiq_check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; n bigint; difference bigint;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN target := COALESCE(NEW.id, OLD.id);
  ELSE target := COALESCE(NEW."entryId", OLD."entryId"); END IF;
  IF EXISTS (SELECT 1 FROM "JournalEntry" WHERE id = target) THEN
    SELECT count(*), COALESCE(sum("debit"::bigint - "credit"::bigint),0) INTO n,difference FROM "JournalLine" WHERE "entryId" = target;
    IF n < 2 OR difference <> 0 THEN RAISE EXCEPTION 'Journal must have at least two balanced lines'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "JournalEntry_balance" AFTER INSERT OR UPDATE ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION seiq_check_journal_balance();
CREATE CONSTRAINT TRIGGER "JournalLine_balance" AFTER INSERT OR UPDATE OR DELETE ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION seiq_check_journal_balance();
CREATE FUNCTION seiq_keep_line_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."entryId" <> NEW."entryId" OR OLD."userId" <> NEW."userId" THEN RAISE EXCEPTION 'Cannot move posted journal lines'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "JournalLine_identity" BEFORE UPDATE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION seiq_keep_line_identity();
