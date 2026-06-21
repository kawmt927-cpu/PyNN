-- CreateTable
CREATE TABLE "SalesMonthlyTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salesTarget" DECIMAL NOT NULL,
    "profitTarget" DECIMAL NOT NULL,
    "paymentTarget" DECIMAL NOT NULL,
    CONSTRAINT "SalesMonthlyTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesMonthlyTarget_userId_year_month_key" ON "SalesMonthlyTarget"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "SalesMonthlyTarget_userId_year_idx" ON "SalesMonthlyTarget"("userId", "year");
