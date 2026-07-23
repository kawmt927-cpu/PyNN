-- AlterTable
ALTER TABLE "Project" ADD COLUMN "sourceModelId" TEXT;

-- AlterTable
ALTER TABLE "ProjectPhase" ADD COLUMN "sourceModelPhaseId" TEXT;
ALTER TABLE "ProjectPhase" ADD COLUMN "plannedStartAt" DATETIME;
ALTER TABLE "ProjectPhase" ADD COLUMN "plannedEndAt" DATETIME;

-- Backfill end date from legacy plannedAt
UPDATE "ProjectPhase" SET "plannedEndAt" = "plannedAt" WHERE "plannedAt" IS NOT NULL AND "plannedEndAt" IS NULL;

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "plannedStartAt" DATETIME NOT NULL,
    "plannedEndAt" DATETIME NOT NULL,
    "assigneeId" TEXT,
    "sourceModelTaskId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectTask_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_phaseId_sortOrder_idx" ON "ProjectTask"("projectId", "phaseId", "sortOrder");
CREATE INDEX "ProjectTask_phaseId_sortOrder_idx" ON "ProjectTask"("phaseId", "sortOrder");
