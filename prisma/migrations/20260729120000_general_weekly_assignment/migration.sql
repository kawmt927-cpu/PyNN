-- AlterTable
-- SQLite: Prisma enums are stored as TEXT; add kind + confirm fields and allow PENDING_CONFIRM status values in app.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesWeeklyAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" DATETIME NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOMER_FOLLOW_UP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" DATETIME,
    "assigneeNote" TEXT,
    "confirmedAt" DATETIME,
    "confirmedById" TEXT,
    "followUpId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesWeeklyAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesWeeklyAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesWeeklyAssignment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesWeeklyAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesWeeklyAssignment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesWeeklyAssignment_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesWeeklyAssignment" ("id", "createdById", "assigneeId", "customerId", "opportunityId", "title", "description", "dueAt", "kind", "status", "completedAt", "followUpId", "createdAt", "updatedAt")
SELECT "id", "createdById", "assigneeId", "customerId", "opportunityId", "title", "description", "dueAt", 'CUSTOMER_FOLLOW_UP', "status", "completedAt", "followUpId", "createdAt", "updatedAt" FROM "SalesWeeklyAssignment";
DROP TABLE "SalesWeeklyAssignment";
ALTER TABLE "new_SalesWeeklyAssignment" RENAME TO "SalesWeeklyAssignment";
CREATE UNIQUE INDEX "SalesWeeklyAssignment_followUpId_key" ON "SalesWeeklyAssignment"("followUpId");
CREATE INDEX "SalesWeeklyAssignment_assigneeId_status_dueAt_idx" ON "SalesWeeklyAssignment"("assigneeId", "status", "dueAt");
CREATE INDEX "SalesWeeklyAssignment_createdById_status_idx" ON "SalesWeeklyAssignment"("createdById", "status");
CREATE INDEX "SalesWeeklyAssignment_kind_status_idx" ON "SalesWeeklyAssignment"("kind", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
