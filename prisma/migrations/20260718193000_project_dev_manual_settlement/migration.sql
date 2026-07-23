-- AlterTable
ALTER TABLE "OpportunityStageLog" ADD COLUMN "countedAsProjectDev" BOOLEAN;
ALTER TABLE "OpportunityStageLog" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "OpportunityStageLog" ADD COLUMN "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX "OpportunityStageLog_createdAt_idx" ON "OpportunityStageLog"("createdAt");
CREATE INDEX "OpportunityStageLog_countedAsProjectDev_idx" ON "OpportunityStageLog"("countedAsProjectDev");
