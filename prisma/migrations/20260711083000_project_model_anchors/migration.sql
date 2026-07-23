-- AlterTable
ALTER TABLE "ProjectModel" ADD COLUMN "totalDurationDays" INTEGER NOT NULL DEFAULT 40;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectModelPhase" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "progressWeight" INTEGER NOT NULL DEFAULT 0,
    "predecessorId" TEXT,
    "successorId" TEXT,
    "startMode" TEXT NOT NULL DEFAULT 'PROJECT',
    "startOffset" INTEGER NOT NULL DEFAULT 1,
    "endMode" TEXT NOT NULL DEFAULT 'DURATION',
    "endOffset" INTEGER NOT NULL DEFAULT 1,
    "durationDays" INTEGER,
    PRIMARY KEY ("id"),
    CONSTRAINT "ProjectModelPhase_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProjectModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectModelPhase_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ProjectModelPhase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectModelPhase_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "ProjectModelPhase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProjectModelPhase" (
  "id", "modelId", "name", "sortOrder", "progressWeight",
  "startMode", "startOffset", "endMode", "endOffset", "durationDays"
)
SELECT
  "id", "modelId", "name", "sortOrder", "progressWeight",
  'PROJECT', 1, 'DURATION', 1, "durationDays"
FROM "ProjectModelPhase";
DROP TABLE "ProjectModelPhase";
ALTER TABLE "new_ProjectModelPhase" RENAME TO "ProjectModelPhase";
CREATE INDEX "ProjectModelPhase_modelId_sortOrder_idx" ON "ProjectModelPhase"("modelId", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
