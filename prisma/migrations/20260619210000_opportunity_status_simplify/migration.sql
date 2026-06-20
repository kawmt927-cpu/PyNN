-- AlterTable: migrate status values and add abandon fields
UPDATE "Opportunity" SET "status" = 'NOT_SIGNED' WHERE "status" IN ('OPEN', 'ON_HOLD');
UPDATE "Opportunity" SET "status" = 'SIGNED' WHERE "status" = 'WON';
UPDATE "Opportunity" SET "status" = 'ABANDONED' WHERE "status" = 'LOST';

ALTER TABLE "Opportunity" ADD COLUMN "abandonReason" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "abandonNote" TEXT;
