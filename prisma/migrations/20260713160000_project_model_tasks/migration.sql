-- CreateTable
CREATE TABLE "ProjectModelTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProjectModelTask_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectModelPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectModelTask_phaseId_sortOrder_idx" ON "ProjectModelTask"("phaseId", "sortOrder");
