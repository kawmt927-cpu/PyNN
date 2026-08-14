-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "businessType" TEXT NOT NULL DEFAULT 'NEW_PROJECT';
ALTER TABLE "Contract" ADD COLUMN "maintenanceStartAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "maintenanceEndAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "maintenanceTotalAmount" DECIMAL;
ALTER TABLE "Contract" ADD COLUMN "annualMaintenanceAmount" DECIMAL;
