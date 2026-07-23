-- CreateTable
CREATE TABLE "PersonnelMonthlyCostAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "adjustmentAmount" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonnelMonthlyCostAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PersonnelMonthlyCostAdjustment_userId_year_month_idx" ON "PersonnelMonthlyCostAdjustment"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PersonnelMonthlyCostAdjustment_userId_year_month_key" ON "PersonnelMonthlyCostAdjustment"("userId", "year", "month");
