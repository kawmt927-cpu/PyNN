-- CreateTable
CREATE TABLE "ContractInvoiceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "taxRatePercent" DECIMAL NOT NULL,
    "invoicedAt" DATETIME NOT NULL,
    "invoiceNo" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractInvoiceRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractInvoiceRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContractInvoiceRecord_contractId_idx" ON "ContractInvoiceRecord"("contractId");

-- CreateIndex
CREATE INDEX "ContractInvoiceRecord_invoicedAt_idx" ON "ContractInvoiceRecord"("invoicedAt");
