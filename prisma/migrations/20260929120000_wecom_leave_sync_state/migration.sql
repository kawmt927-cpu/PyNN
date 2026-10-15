-- CreateTable
CREATE TABLE "WecomLeaveSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastMessage" TEXT,
    "lastImported" INTEGER NOT NULL DEFAULT 0,
    "lastCancelled" INTEGER NOT NULL DEFAULT 0,
    "lastScanned" INTEGER NOT NULL DEFAULT 0,
    "lastTrigger" TEXT,
    "lastSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("id")
);
