-- CreateTable enum values stored as TEXT in SQLite
-- AlterTable: replace collectionDifficulty with collectionStatus

ALTER TABLE "PaymentInstallment" ADD COLUMN "collectionStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED';

UPDATE "PaymentInstallment"
SET "collectionStatus" = 'DIFFICULT'
WHERE "collectionDifficulty" = 1;

ALTER TABLE "PaymentInstallment" DROP COLUMN "collectionDifficulty";
