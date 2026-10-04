-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiNote" TEXT NOT NULL DEFAULT '';

