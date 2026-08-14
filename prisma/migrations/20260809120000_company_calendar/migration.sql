-- CreateTable
CREATE TABLE "CompanyCalendarDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'builtin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CompanyCalendarDay_dayKey_key" ON "CompanyCalendarDay"("dayKey");
CREATE INDEX "CompanyCalendarDay_year_kind_idx" ON "CompanyCalendarDay"("year", "kind");

-- CreateTable
CREATE TABLE "CompanyCalendarYearSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dayCount" INTEGER NOT NULL DEFAULT 0,
    "papersJson" TEXT,
    "message" TEXT,
    "syncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CompanyCalendarYearSync_year_key" ON "CompanyCalendarYearSync"("year");
