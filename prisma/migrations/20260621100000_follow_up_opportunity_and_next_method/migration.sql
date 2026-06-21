-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN "nextFollowUpMethod" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "opportunityId" TEXT;

-- CreateIndex
CREATE INDEX "FollowUp_opportunityId_idx" ON "FollowUp"("opportunityId");
