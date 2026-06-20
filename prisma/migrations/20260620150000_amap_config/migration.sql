-- CreateTable
CREATE TABLE "AmapConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "webServiceKey" TEXT,
    "jsKey" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "AmapConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
