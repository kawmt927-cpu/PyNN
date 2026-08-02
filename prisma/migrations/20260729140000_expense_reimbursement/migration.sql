-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantId" TEXT NOT NULL,
    "managerId" TEXT,
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
    CONSTRAINT "ExpenseClaim_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ExpenseTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "city" TEXT,
    "customerId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseTrip_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ExpenseInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
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
    CONSTRAINT "ExpenseInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_presalesUserId_fkey" FOREIGN KEY ("presalesUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_postedSalesCostId_fkey" FOREIGN KEY ("postedSalesCostId") REFERENCES "SalesCost" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExpenseInvoice_postedProjectCostId_fkey" FOREIGN KEY ("postedProjectCostId") REFERENCES "ProjectCost" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ExpenseApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseApproval_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseApproval_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ExpensePayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpensePayout_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpensePayout_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExpenseInvoice_postedSalesCostId_key" ON "ExpenseInvoice"("postedSalesCostId");
CREATE UNIQUE INDEX "ExpenseInvoice_postedProjectCostId_key" ON "ExpenseInvoice"("postedProjectCostId");
CREATE UNIQUE INDEX "ExpensePayout_claimId_key" ON "ExpensePayout"("claimId");
CREATE INDEX "ExpenseClaim_applicantId_status_updatedAt_idx" ON "ExpenseClaim"("applicantId", "status", "updatedAt");
CREATE INDEX "ExpenseClaim_managerId_status_idx" ON "ExpenseClaim"("managerId", "status");
CREATE INDEX "ExpenseClaim_status_submittedAt_idx" ON "ExpenseClaim"("status", "submittedAt");
CREATE INDEX "ExpenseTrip_claimId_idx" ON "ExpenseTrip"("claimId");
CREATE INDEX "ExpenseInvoice_claimId_sortOrder_idx" ON "ExpenseInvoice"("claimId", "sortOrder");
CREATE INDEX "ExpenseApproval_claimId_createdAt_idx" ON "ExpenseApproval"("claimId", "createdAt");
CREATE INDEX "ExpenseApproval_actorId_createdAt_idx" ON "ExpenseApproval"("actorId", "createdAt");
