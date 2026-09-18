-- P2 skeleton: PresalesRequest, SalesMonthlyReport, ProjectAcceptance, ProjectChangeRequest
-- SQLite: Prisma enums stored as TEXT

-- CreateTable
CREATE TABLE "PresalesRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "preferredPresalesUserId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PresalesRequest_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PresalesRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PresalesRequest_preferredPresalesUserId_fkey" FOREIGN KEY ("preferredPresalesUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PresalesRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesMonthlyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT NOT NULL,
    CONSTRAINT "SalesMonthlyReport_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectAcceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "acceptedAt" DATETIME NOT NULL,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectAcceptance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectAcceptance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "impact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requesterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectChangeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectChangeRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PresalesRequest_status_idx" ON "PresalesRequest"("status");
CREATE INDEX "PresalesRequest_customerId_idx" ON "PresalesRequest"("customerId");
CREATE INDEX "PresalesRequest_salesUserId_idx" ON "PresalesRequest"("salesUserId");

CREATE UNIQUE INDEX "SalesMonthlyReport_year_month_key" ON "SalesMonthlyReport"("year", "month");
CREATE INDEX "SalesMonthlyReport_year_month_idx" ON "SalesMonthlyReport"("year", "month");

CREATE INDEX "ProjectAcceptance_projectId_idx" ON "ProjectAcceptance"("projectId");

CREATE INDEX "ProjectChangeRequest_projectId_idx" ON "ProjectChangeRequest"("projectId");
CREATE INDEX "ProjectChangeRequest_status_idx" ON "ProjectChangeRequest"("status");

-- Seed lead grade option (线索池复用 customerGrade=LEAD / 线索)
INSERT OR IGNORE INTO "ConfigOption" ("id", "category", "value", "label", "sortOrder", "enabled")
VALUES ('cfg-customer-grade-lead', 'customer_grade', 'LEAD', '线索', 0, true);
