-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contractId" TEXT,
    "customerId" TEXT,
    "projectManagerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_START',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "plannedStartAt" DATETIME,
    "plannedEndAt" DATETIME,
    "actualStartAt" DATETIME,
    "actualEndAt" DATETIME,
    "notes" TEXT,
    "sourceModelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_sourceModelId_fkey" FOREIGN KEY ("sourceModelId") REFERENCES "ProjectModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("id", "name", "contractId", "customerId", "projectManagerId", "status", "progressPercent", "plannedStartAt", "plannedEndAt", "actualStartAt", "actualEndAt", "notes", "sourceModelId", "createdAt", "updatedAt")
SELECT "id", "name", "contractId", "customerId", "projectManagerId", "status", "progressPercent", "plannedStartAt", "plannedEndAt", "actualStartAt", "actualEndAt", "notes", "sourceModelId", "createdAt", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_contractId_key" ON "Project"("contractId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
