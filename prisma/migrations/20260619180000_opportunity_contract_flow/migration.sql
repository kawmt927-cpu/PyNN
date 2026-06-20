-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expectedAmount" DECIMAL NOT NULL,
    "expectedCloseDate" DATETIME NOT NULL,
    "stage" TEXT NOT NULL,
    "requirementDesc" TEXT,
    "winProbability" INTEGER,
    "competitor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "amountLocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunityStageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityStageLog_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityStageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunityFollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "followUpAt" DATETIME NOT NULL,
    "nextFollowUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpportunityFollowUp_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityFollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "totalAmount" DECIMAL NOT NULL,
    "signingType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SIGN',
    "signCustomerId" TEXT NOT NULL,
    "endUserCustomerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "signedAt" DATETIME,
    "effectiveAt" DATETIME,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_signCustomerId_fkey" FOREIGN KEY ("signCustomerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_endUserCustomerId_fkey" FOREIGN KEY ("endUserCustomerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("id", "title", "totalAmount", "signingType", "status", "signCustomerId", "endUserCustomerId", "ownerId", "signedAt", "effectiveAt", "expiresAt", "notes", "createdAt", "updatedAt") SELECT "id", "title", "totalAmount", "signingType", "status", "signCustomerId", "endUserCustomerId", "ownerId", "signedAt", "effectiveAt", "expiresAt", "notes", "createdAt", "updatedAt" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_idx" ON "Opportunity"("ownerId");
CREATE INDEX "Opportunity_customerId_idx" ON "Opportunity"("customerId");
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");
CREATE INDEX "Opportunity_stage_idx" ON "Opportunity"("stage");
CREATE INDEX "OpportunityStageLog_opportunityId_idx" ON "OpportunityStageLog"("opportunityId");
CREATE INDEX "OpportunityFollowUp_opportunityId_idx" ON "OpportunityFollowUp"("opportunityId");
CREATE INDEX "Contract_opportunityId_idx" ON "Contract"("opportunityId");
