-- CreateEnum
CREATE TABLE IF NOT EXISTS "FollowUp_new_placeholder" ("id" TEXT);
DROP TABLE IF EXISTS "FollowUp_new_placeholder";

-- SQLite: Prisma enum as TEXT check via application; store as string column
-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN "confirmStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "FollowUp" ADD COLUMN "confirmedAt" DATETIME;
ALTER TABLE "FollowUp" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "confirmRejectReason" TEXT;

-- CreateIndex
CREATE INDEX "FollowUp_confirmStatus_createdAt_idx" ON "FollowUp"("confirmStatus", "createdAt");
CREATE INDEX "FollowUp_customerId_confirmStatus_followUpAt_idx" ON "FollowUp"("customerId", "confirmStatus", "followUpAt");
