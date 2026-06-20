-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "contactId" TEXT,
    "checkedInAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" REAL,
    "longitude" REAL,
    "locationText" TEXT,
    "addressProvince" TEXT,
    "addressCity" TEXT,
    "addressDistrict" TEXT,
    "addressStreet" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "followUpId" TEXT,
    "salesDailyLogId" TEXT,
    CONSTRAINT "SalesCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesCheckIn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesCheckIn_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesCheckIn_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesCheckIn_salesDailyLogId_fkey" FOREIGN KEY ("salesDailyLogId") REFERENCES "SalesDailyLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesCheckIn" ("id", "userId", "customerId", "contactId", "checkedInAt", "latitude", "longitude", "locationText", "addressProvince", "addressCity", "addressDistrict", "addressStreet", "notes", "status", "followUpId", "salesDailyLogId") SELECT "id", "userId", "customerId", "contactId", "checkedInAt", "latitude", "longitude", "locationText", "addressProvince", "addressCity", "addressDistrict", "addressStreet", "notes", "status", "followUpId", "salesDailyLogId" FROM "SalesCheckIn";
DROP TABLE "SalesCheckIn";
ALTER TABLE "new_SalesCheckIn" RENAME TO "SalesCheckIn";
CREATE UNIQUE INDEX "SalesCheckIn_followUpId_key" ON "SalesCheckIn"("followUpId");
CREATE INDEX "SalesCheckIn_userId_checkedInAt_idx" ON "SalesCheckIn"("userId", "checkedInAt");
CREATE INDEX "SalesCheckIn_customerId_idx" ON "SalesCheckIn"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
