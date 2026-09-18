-- Make ExpenseTrip.itemId optional (claim-level itinerary for TRAVEL claims)
CREATE TABLE "new_ExpenseTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "itemId" TEXT,
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
INSERT INTO "new_ExpenseTrip" ("id", "claimId", "itemId", "sortOrder", "startDate", "endDate", "fromCity", "city", "customerId", "description", "createdAt")
SELECT "id", "claimId", "itemId", "sortOrder", "startDate", "endDate", "fromCity", "city", "customerId", "description", "createdAt" FROM "ExpenseTrip";
DROP TABLE "ExpenseTrip";
ALTER TABLE "new_ExpenseTrip" RENAME TO "ExpenseTrip";
CREATE INDEX "ExpenseTrip_claimId_sortOrder_idx" ON "ExpenseTrip"("claimId", "sortOrder");
CREATE INDEX "ExpenseTrip_itemId_sortOrder_idx" ON "ExpenseTrip"("itemId", "sortOrder");
