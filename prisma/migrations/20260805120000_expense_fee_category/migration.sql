-- CreateTable
CREATE TABLE "ExpenseFeeCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enforceHotelCap" BOOLEAN NOT NULL DEFAULT false,
    "suggestedTarget" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ExpenseFeeCategory_key_key" ON "ExpenseFeeCategory"("key");
CREATE INDEX "ExpenseFeeCategory_enabled_sortOrder_idx" ON "ExpenseFeeCategory"("enabled", "sortOrder");
