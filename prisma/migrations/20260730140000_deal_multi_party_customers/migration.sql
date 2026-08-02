-- Make Opportunity.customerId optional + multi-party associations

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "ownerId" TEXT NOT NULL,
    "expectedAmount" DECIMAL NOT NULL,
    "expectedCloseDate" DATETIME NOT NULL,
    "stage" TEXT NOT NULL,
    "requirementDesc" TEXT,
    "winProbability" INTEGER,
    "competitor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_SIGNED',
    "amountLocked" BOOLEAN NOT NULL DEFAULT false,
    "abandonReason" TEXT,
    "abandonNote" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Opportunity" (
  "id", "title", "customerId", "ownerId", "expectedAmount", "expectedCloseDate", "stage",
  "requirementDesc", "winProbability", "competitor", "status", "amountLocked",
  "abandonReason", "abandonNote", "notes", "createdAt", "updatedAt"
)
SELECT
  "id", "title", "customerId", "ownerId", "expectedAmount", "expectedCloseDate", "stage",
  "requirementDesc", "winProbability", "competitor", "status", "amountLocked",
  "abandonReason", "abandonNote", "notes", "createdAt", "updatedAt"
FROM "Opportunity";

DROP TABLE "Opportunity";
ALTER TABLE "new_Opportunity" RENAME TO "Opportunity";

CREATE INDEX "Opportunity_ownerId_idx" ON "Opportunity"("ownerId");
CREATE INDEX "Opportunity_customerId_idx" ON "Opportunity"("customerId");
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");
CREATE INDEX "Opportunity_stage_idx" ON "Opportunity"("stage");

CREATE TABLE "OpportunityParty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityParty_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityParty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OpportunityParty_opportunityId_customerId_key" ON "OpportunityParty"("opportunityId", "customerId");
CREATE INDEX "OpportunityParty_customerId_idx" ON "OpportunityParty"("customerId");
CREATE INDEX "OpportunityParty_opportunityId_role_idx" ON "OpportunityParty"("opportunityId", "role");

CREATE TABLE "ContractParty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractParty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContractParty_contractId_customerId_key" ON "ContractParty"("contractId", "customerId");
CREATE INDEX "ContractParty_customerId_idx" ON "ContractParty"("customerId");
CREATE INDEX "ContractParty_contractId_role_idx" ON "ContractParty"("contractId", "role");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
