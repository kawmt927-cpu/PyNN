-- CreateTable
CREATE TABLE "ProjectStaffAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phaseId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "allocationMode" TEXT NOT NULL DEFAULT 'AUTO',
    "plannedDays" DECIMAL,
    "splitWeight" DECIMAL,
    "dailyRateSnapshot" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectStaffAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectStaffAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectStaffAllocation_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectStaffAllocation_projectId_idx" ON "ProjectStaffAllocation"("projectId");

-- CreateIndex
CREATE INDEX "ProjectStaffAllocation_userId_startDate_endDate_idx" ON "ProjectStaffAllocation"("userId", "startDate", "endDate");
