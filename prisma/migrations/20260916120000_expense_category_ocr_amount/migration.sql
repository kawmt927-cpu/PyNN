-- AlterTable
ALTER TABLE "ExpenseClaimItem" ADD COLUMN "categoryKey" TEXT;

-- AlterTable
ALTER TABLE "ExpenseInvoice" ADD COLUMN "ocrAmount" DECIMAL;

UPDATE "ExpenseInvoice" SET "ocrAmount" = "amount" WHERE "ocrAmount" IS NULL AND "amount" IS NOT NULL;
