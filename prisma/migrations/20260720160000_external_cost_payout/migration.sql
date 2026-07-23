-- AlterTable
ALTER TABLE "ContractProduct" ADD COLUMN "costType" TEXT NOT NULL DEFAULT 'INTERNAL';

-- CreateIndex
CREATE INDEX "ContractProduct_contractId_idx" ON "ContractProduct"("contractId");
CREATE INDEX "ContractProduct_costType_idx" ON "ContractProduct"("costType");

-- CreateTable
CREATE TABLE "ExternalCostInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractProductId" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "condition" TEXT,
    "dueAt" DATETIME,
    CONSTRAINT "ExternalCostInstallment_contractProductId_fkey" FOREIGN KEY ("contractProductId") REFERENCES "ContractProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExternalCostInstallment_contractProductId_periodNumber_key" ON "ExternalCostInstallment"("contractProductId", "periodNumber");
CREATE INDEX "ExternalCostInstallment_contractProductId_idx" ON "ExternalCostInstallment"("contractProductId");

CREATE TABLE "ExternalCostPayoutRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "contractProductId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalCostPayoutRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalCostPayoutRecord_contractProductId_fkey" FOREIGN KEY ("contractProductId") REFERENCES "ContractProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalCostPayoutRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ExternalCostPayoutRecord_contractId_idx" ON "ExternalCostPayoutRecord"("contractId");
CREATE INDEX "ExternalCostPayoutRecord_contractProductId_idx" ON "ExternalCostPayoutRecord"("contractProductId");
CREATE INDEX "ExternalCostPayoutRecord_paidAt_idx" ON "ExternalCostPayoutRecord"("paidAt");
