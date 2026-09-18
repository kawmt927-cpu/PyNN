-- CreateTable
CREATE TABLE "ExpenseClaimItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "customerId" TEXT,
    "projectId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseClaimItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseClaimItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ExpenseClaimItem_claimId_sortOrder_idx" ON "ExpenseClaimItem"("claimId", "sortOrder");
CREATE INDEX "ExpenseClaimItem_projectId_idx" ON "ExpenseClaimItem"("projectId");

-- RedefineTable ExpenseClaim: add beneficiaryId + projectId
CREATE TABLE "new_ExpenseClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "managerId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "submittedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectReason" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseClaim_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseClaim_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseClaim_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseClaim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ExpenseClaim" (
  "id", "applicantId", "beneficiaryId", "managerId", "projectId", "title", "description",
  "status", "totalAmount", "submittedAt", "rejectedAt", "rejectReason", "paidAt", "createdAt", "updatedAt"
)
SELECT
  "id", "applicantId", "applicantId", "managerId", NULL, "title", "description",
  "status", "totalAmount", "submittedAt", "rejectedAt", "rejectReason", "paidAt", "createdAt", "updatedAt"
FROM "ExpenseClaim";

DROP TABLE "ExpenseClaim";
ALTER TABLE "new_ExpenseClaim" RENAME TO "ExpenseClaim";

CREATE INDEX "ExpenseClaim_applicantId_status_updatedAt_idx" ON "ExpenseClaim"("applicantId", "status", "updatedAt");
CREATE INDEX "ExpenseClaim_beneficiaryId_status_updatedAt_idx" ON "ExpenseClaim"("beneficiaryId", "status", "updatedAt");
CREATE INDEX "ExpenseClaim_managerId_status_idx" ON "ExpenseClaim"("managerId", "status");
CREATE INDEX "ExpenseClaim_projectId_status_idx" ON "ExpenseClaim"("projectId", "status");
CREATE INDEX "ExpenseClaim_status_submittedAt_idx" ON "ExpenseClaim"("status", "submittedAt");

-- Redefine ExpenseTrip with itemId
CREATE TABLE "new_ExpenseTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "fromCity" TEXT,
    "city" TEXT,
    "customerId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseTrip_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseTrip_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ExpenseClaimItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- No existing trips to migrate
DROP TABLE "ExpenseTrip";
ALTER TABLE "new_ExpenseTrip" RENAME TO "ExpenseTrip";
CREATE INDEX "ExpenseTrip_claimId_sortOrder_idx" ON "ExpenseTrip"("claimId", "sortOrder");
CREATE INDEX "ExpenseTrip_itemId_sortOrder_idx" ON "ExpenseTrip"("itemId", "sortOrder");

-- Redefine ExpenseInvoice with itemId
CREATE TABLE "new_ExpenseInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "categoryKey" TEXT,
    "amount" DECIMAL,
    "taxRatePercent" DECIMAL,
    "invoiceNo" TEXT,
    "invoicedAt" DATETIME,
    "sellerName" TEXT,
    "ocrNotes" TEXT,
    "ocrConfidence" TEXT,
    "ocrRawSummary" TEXT,
    "costTarget" TEXT,
    "salesCostType" TEXT,
    "customerId" TEXT,
    "presalesUserId" TEXT,
    "projectId" TEXT,
    "costCategory" TEXT,
    "postedSalesCostId" TEXT,
    "postedProjectCostId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseInvoice_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ExpenseClaimItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_presalesUserId_fkey" FOREIGN KEY ("presalesUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_postedSalesCostId_fkey" FOREIGN KEY ("postedSalesCostId") REFERENCES "SalesCost" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_postedProjectCostId_fkey" FOREIGN KEY ("postedProjectCostId") REFERENCES "ProjectCost" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

DROP TABLE "ExpenseInvoice";
ALTER TABLE "new_ExpenseInvoice" RENAME TO "ExpenseInvoice";
CREATE UNIQUE INDEX "ExpenseInvoice_postedSalesCostId_key" ON "ExpenseInvoice"("postedSalesCostId");
CREATE UNIQUE INDEX "ExpenseInvoice_postedProjectCostId_key" ON "ExpenseInvoice"("postedProjectCostId");
CREATE INDEX "ExpenseInvoice_claimId_sortOrder_idx" ON "ExpenseInvoice"("claimId", "sortOrder");
CREATE INDEX "ExpenseInvoice_itemId_sortOrder_idx" ON "ExpenseInvoice"("itemId", "sortOrder");
