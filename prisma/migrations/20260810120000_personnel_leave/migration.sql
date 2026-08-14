-- CreateTable
CREATE TABLE "PersonnelLeaveType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payFactor" REAL NOT NULL DEFAULT 0,
    "countsAsAbsence" BOOLEAN NOT NULL DEFAULT true,
    "exemptDailyReport" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PersonnelLeaveType_key_key" ON "PersonnelLeaveType"("key");
CREATE INDEX "PersonnelLeaveType_enabled_sortOrder_idx" ON "PersonnelLeaveType"("enabled", "sortOrder");

CREATE TABLE "PersonnelLeave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDayKey" TEXT NOT NULL,
    "endDayKey" TEXT NOT NULL,
    "note" TEXT,
    "wecomSpNo" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonnelLeave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonnelLeave_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "PersonnelLeaveType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PersonnelLeave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PersonnelLeave_userId_status_startDayKey_endDayKey_idx" ON "PersonnelLeave"("userId", "status", "startDayKey", "endDayKey");
CREATE INDEX "PersonnelLeave_wecomSpNo_idx" ON "PersonnelLeave"("wecomSpNo");
CREATE INDEX "PersonnelLeave_source_status_idx" ON "PersonnelLeave"("source", "status");

CREATE TABLE "PersonnelLeaveDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leaveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "countsAsAbsence" BOOLEAN NOT NULL DEFAULT true,
    "exemptDailyReport" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "PersonnelLeaveDay_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "PersonnelLeave" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonnelLeaveDay_userId_dayKey_leaveId_key" ON "PersonnelLeaveDay"("userId", "dayKey", "leaveId");
CREATE INDEX "PersonnelLeaveDay_userId_dayKey_status_idx" ON "PersonnelLeaveDay"("userId", "dayKey", "status");
CREATE INDEX "PersonnelLeaveDay_dayKey_status_idx" ON "PersonnelLeaveDay"("dayKey", "status");

-- AlterTable: 事后关账字段
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "leaveDeductionAmount" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "attendanceDays" INTEGER;
