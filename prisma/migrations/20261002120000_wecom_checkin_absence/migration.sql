-- CreateTable
CREATE TABLE "WecomCheckinAbsence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "exceptionCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dayFraction" REAL NOT NULL DEFAULT 1,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("id"),
    CONSTRAINT "WecomCheckinAbsence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WecomCheckinAbsence_userId_dayKey_key" ON "WecomCheckinAbsence"("userId", "dayKey");
CREATE INDEX "WecomCheckinAbsence_dayKey_status_idx" ON "WecomCheckinAbsence"("dayKey", "status");
CREATE INDEX "WecomCheckinAbsence_userId_status_dayKey_idx" ON "WecomCheckinAbsence"("userId", "status", "dayKey");

-- CreateTable
CREATE TABLE "WecomCheckinSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastMessage" TEXT,
    "lastUpserted" INTEGER NOT NULL DEFAULT 0,
    "lastCleared" INTEGER NOT NULL DEFAULT 0,
    "lastScanned" INTEGER NOT NULL DEFAULT 0,
    "lastTrigger" TEXT,
    "lastSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("id")
);
