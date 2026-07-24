-- CreateTable
CREATE TABLE "ContractInvoiceAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceRecordId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractInvoiceAttachment_invoiceRecordId_fkey" FOREIGN KEY ("invoiceRecordId") REFERENCES "ContractInvoiceRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractInvoiceAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContractInvoiceAttachment_invoiceRecordId_idx" ON "ContractInvoiceAttachment"("invoiceRecordId");
