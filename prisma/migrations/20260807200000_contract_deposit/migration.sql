-- CreateTable
CREATE TABLE "ContractDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidOutAt" DATETIME NOT NULL,
    "recoverCondition" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractDeposit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractDepositRecovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "depositId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "recoveredAt" DATETIME NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractDepositRecovery_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "ContractDeposit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractDepositRecovery_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContractDeposit_contractId_idx" ON "ContractDeposit"("contractId");

-- CreateIndex
CREATE INDEX "ContractDeposit_paidOutAt_idx" ON "ContractDeposit"("paidOutAt");

-- CreateIndex
CREATE INDEX "ContractDepositRecovery_depositId_idx" ON "ContractDepositRecovery"("depositId");

-- CreateIndex
CREATE INDEX "ContractDepositRecovery_recoveredAt_idx" ON "ContractDepositRecovery"("recoveredAt");
