-- CreateTable
CREATE TABLE "AppFeatureFlags" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "expenseReimbursementEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "AppFeatureFlags_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
