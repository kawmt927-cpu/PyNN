-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "confirmStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Opportunity" ADD COLUMN "confirmedAt" DATETIME;
ALTER TABLE "Opportunity" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "confirmRejectReason" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Opportunity_confirmStatus_createdAt_idx" ON "Opportunity"("confirmStatus", "createdAt");
CREATE INDEX "Opportunity_customerId_confirmStatus_idx" ON "Opportunity"("customerId", "confirmStatus");
