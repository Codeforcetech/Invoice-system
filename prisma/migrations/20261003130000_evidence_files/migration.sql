-- Evidence file box (electronic transaction records). Additive only.
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transactionDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "counterparty" TEXT NOT NULL,
    "counterpartyKey" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "uploadedById" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceHistory" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceFile_ownerId_sourceType_sourceId_key" ON "EvidenceFile"("ownerId", "sourceType", "sourceId");
CREATE INDEX "EvidenceFile_ownerId_transactionDate_idx" ON "EvidenceFile"("ownerId", "transactionDate");
CREATE INDEX "EvidenceFile_ownerId_amount_idx" ON "EvidenceFile"("ownerId", "amount");
CREATE INDEX "EvidenceFile_ownerId_counterpartyKey_idx" ON "EvidenceFile"("ownerId", "counterpartyKey");
CREATE INDEX "EvidenceHistory_evidenceId_createdAt_idx" ON "EvidenceHistory"("evidenceId", "createdAt");
CREATE INDEX "EvidenceHistory_ownerId_createdAt_idx" ON "EvidenceHistory"("ownerId", "createdAt");

ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceHistory" ADD CONSTRAINT "EvidenceHistory_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The same file is stored once per workspace while it is active.
CREATE UNIQUE INDEX "EvidenceFile_active_sha256_key" ON "EvidenceFile"("ownerId", "sha256") WHERE "status" = 'ACTIVE';

ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_kind_check"
  CHECK ("kind" IN ('RECEIPT', 'INVOICE', 'QUOTE', 'ORDER', 'CONTRACT', 'OTHER'));
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_status_check"
  CHECK ("status" IN ('ACTIVE', 'VOID'));
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_void_check"
  CHECK (("status" = 'ACTIVE' AND "voidedAt" IS NULL) OR ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL));

-- The stored file can never change or be deleted. Only the search fields and the status
-- (through the application, which records every change in EvidenceHistory) may be updated.
CREATE FUNCTION "EvidenceFile_protect"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EvidenceFile cannot be deleted';
  END IF;
  IF NEW."data" IS DISTINCT FROM OLD."data"
     OR NEW."sha256" <> OLD."sha256"
     OR NEW."filename" <> OLD."filename"
     OR NEW."mimeType" <> OLD."mimeType"
     OR NEW."size" <> OLD."size"
     OR NEW."ownerId" <> OLD."ownerId"
     OR NEW."uploadedById" <> OLD."uploadedById"
     OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
     OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId" THEN
    RAISE EXCEPTION 'The stored evidence file cannot be changed';
  END IF;
  IF OLD."status" = 'VOID' AND NEW."status" <> 'VOID' THEN
    RAISE EXCEPTION 'A voided evidence file cannot be restored';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "EvidenceFile_no_change" BEFORE UPDATE OR DELETE ON "EvidenceFile"
  FOR EACH ROW EXECUTE FUNCTION "EvidenceFile_protect"();

CREATE FUNCTION "EvidenceHistory_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EvidenceHistory is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "EvidenceHistory_no_update" BEFORE UPDATE OR DELETE ON "EvidenceHistory"
  FOR EACH ROW EXECUTE FUNCTION "EvidenceHistory_append_only"();
