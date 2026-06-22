-- ContractStatus: add PENDING_APPROVAL, REJECTED
-- SQLite doesn't support ALTER ENUM; recreate via table copy if needed.
-- Prisma with SQLite uses TEXT for enums.

-- Contract new columns
ALTER TABLE "Contract" ADD COLUMN "contractNo" TEXT;
ALTER TABLE "Contract" ADD COLUMN "signContactId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "ourRepresentativeId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Contract" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "Contract" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Contract" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "rejectReason" TEXT;

CREATE UNIQUE INDEX "Contract_contractNo_key" ON "Contract"("contractNo");
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- ContractProduct costAmount
ALTER TABLE "ContractProduct" ADD COLUMN "costAmount" REAL NOT NULL DEFAULT 0;
UPDATE "ContractProduct" SET "costAmount" = "actualCostPrice" WHERE "costAmount" = 0;

-- ContractPaymentRecord
CREATE TABLE "ContractPaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractPaymentRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractPaymentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ContractPaymentRecord_contractId_idx" ON "ContractPaymentRecord"("contractId");
CREATE INDEX "ContractPaymentRecord_paidAt_idx" ON "ContractPaymentRecord"("paidAt");

-- Foreign keys for Contract relations
-- SQLite: add FK constraints if not present (Prisma may handle on migrate)
