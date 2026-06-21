-- CreateTable
CREATE TABLE "SalesPlanBoard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesPlanBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesPlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesPlanItem_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "SalesPlanBoard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesPlanItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesPlanItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesPlanBoard_userId_period_year_month_key" ON "SalesPlanBoard"("userId", "period", "year", "month");

-- CreateIndex
CREATE INDEX "SalesPlanBoard_userId_year_idx" ON "SalesPlanBoard"("userId", "year");

-- CreateIndex
CREATE INDEX "SalesPlanItem_boardId_status_sortOrder_idx" ON "SalesPlanItem"("boardId", "status", "sortOrder");
