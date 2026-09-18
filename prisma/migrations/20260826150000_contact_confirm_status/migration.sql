-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "confirmStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Contact" ADD COLUMN "confirmedAt" DATETIME;
ALTER TABLE "Contact" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "Contact" ADD COLUMN "confirmRejectReason" TEXT;
ALTER TABLE "Contact" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Contact_confirmStatus_createdAt_idx" ON "Contact"("confirmStatus", "createdAt");
CREATE INDEX "Contact_customerId_confirmStatus_idx" ON "Contact"("customerId", "confirmStatus");
