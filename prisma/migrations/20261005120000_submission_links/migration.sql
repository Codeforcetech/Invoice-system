-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "linkId" TEXT,
ALTER COLUMN "submitterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SubmissionLink" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "maxPending" INTEGER NOT NULL DEFAULT 3,
    "maxSubmissions" INTEGER NOT NULL DEFAULT 20,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "aiReadsLimit" INTEGER NOT NULL DEFAULT 5,
    "aiReadsUsed" INTEGER NOT NULL DEFAULT 0,
    "profile" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicThrottle" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "PublicThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionLink_tokenHash_key" ON "SubmissionLink"("tokenHash");

-- CreateIndex
CREATE INDEX "SubmissionLink_ownerId_createdAt_idx" ON "SubmissionLink"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_linkId_status_idx" ON "Submission"("linkId", "status");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SubmissionLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLink" ADD CONSTRAINT "SubmissionLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 提出は、メンバーか外部リンクの、どちらか必ず一方から来る。
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_source_check"
  CHECK (("submitterId" IS NOT NULL AND "linkId" IS NULL) OR ("submitterId" IS NULL AND "linkId" IS NOT NULL));
ALTER TABLE "SubmissionLink" ADD CONSTRAINT "SubmissionLink_limits_check"
  CHECK ("maxPending" BETWEEN 1 AND 20 AND "maxSubmissions" BETWEEN 1 AND 200 AND "aiReadsLimit" BETWEEN 0 AND 50
         AND "submissionCount" >= 0 AND "aiReadsUsed" >= 0);
ALTER TABLE "SubmissionLink" ADD CONSTRAINT "SubmissionLink_hash_check"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "PublicThrottle" ADD CONSTRAINT "PublicThrottle_count_check" CHECK ("count" >= 0);
