-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "hospitalLevel" TEXT,
    "province" TEXT,
    "city" TEXT,
    "district" TEXT,
    "bedCount" INTEGER,
    "existingSystem" TEXT,
    "source" TEXT,
    "customerType" TEXT,
    "customerGrade" TEXT,
    "ownerId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("id", "name", "category", "hospitalLevel", "province", "city", "district", "bedCount", "existingSystem", "source", "ownerId", "notes", "createdAt", "updatedAt")
SELECT "id", "name", "category", "hospitalLevel", "province", "city", "district", "bedCount", "existingSystem", "source", "ownerId", "notes", "createdAt", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE TABLE "new_FollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "followUpAt" DATETIME NOT NULL,
    "nextFollowUpAt" DATETIME,
    "suggestedGrade" TEXT,
    "gradeApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "salesDailyLogId" TEXT,
    CONSTRAINT "FollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_salesDailyLogId_fkey" FOREIGN KEY ("salesDailyLogId") REFERENCES "SalesDailyLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FollowUp" ("id", "customerId", "contactId", "userId", "method", "content", "result", "followUpAt", "nextFollowUpAt", "gradeApplied", "createdAt", "updatedAt", "salesDailyLogId")
SELECT "id", "customerId", "contactId", "userId", "method", "content", "result", "followUpAt", "nextFollowUpAt", "statusApplied", "createdAt", "updatedAt", "salesDailyLogId" FROM "FollowUp";
DROP TABLE "FollowUp";
ALTER TABLE "new_FollowUp" RENAME TO "FollowUp";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
