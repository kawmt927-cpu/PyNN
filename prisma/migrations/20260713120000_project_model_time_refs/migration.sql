-- 阶段起止改为参照锚点 + 浮动天数
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProjectModelPhase" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "progressWeight" INTEGER NOT NULL DEFAULT 0,
    "startRef" TEXT NOT NULL DEFAULT 'PROJECT_START',
    "startOffset" INTEGER NOT NULL DEFAULT 0,
    "endRef" TEXT NOT NULL DEFAULT 'DURATION',
    "endOffset" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER,
    PRIMARY KEY ("id"),
    CONSTRAINT "ProjectModelPhase_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProjectModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ProjectModelPhase" (
    "id", "modelId", "name", "sortOrder", "progressWeight",
    "startRef", "startOffset", "endRef", "endOffset", "durationDays"
)
SELECT
    "id",
    "modelId",
    "name",
    "sortOrder",
    "progressWeight",
    CASE
        WHEN "startMode" = 'PROJECT' THEN 'PROJECT_START'
        WHEN "startMode" = 'PREDECESSOR' AND "predecessorId" IS NOT NULL THEN 'PHASE_END:' || "predecessorId"
        WHEN "startMode" = 'SUCCESSOR' AND "successorId" IS NOT NULL THEN 'PHASE_START:' || "successorId"
        ELSE 'PROJECT_START'
    END,
    CASE
        WHEN "startMode" = 'PROJECT' THEN "startOffset" - 1
        WHEN "startMode" = 'PREDECESSOR' THEN "startOffset" + 1
        WHEN "startMode" = 'SUCCESSOR' THEN -"startOffset"
        ELSE 0
    END,
    CASE
        WHEN "endMode" = 'DURATION' THEN 'DURATION'
        WHEN "endMode" = 'PROJECT' THEN 'PROJECT_START'
        WHEN "endMode" = 'PREDECESSOR' AND "predecessorId" IS NOT NULL THEN 'PHASE_END:' || "predecessorId"
        WHEN "endMode" = 'SUCCESSOR' AND "successorId" IS NOT NULL THEN 'PHASE_START:' || "successorId"
        ELSE 'DURATION'
    END,
    CASE
        WHEN "endMode" = 'DURATION' THEN 0
        WHEN "endMode" = 'PROJECT' THEN "endOffset" - 1
        WHEN "endMode" = 'SUCCESSOR' THEN -("endOffset" + 1)
        ELSE 0
    END,
    "durationDays"
FROM "ProjectModelPhase";

DROP TABLE "ProjectModelPhase";
ALTER TABLE "new_ProjectModelPhase" RENAME TO "ProjectModelPhase";
CREATE INDEX "ProjectModelPhase_modelId_sortOrder_idx" ON "ProjectModelPhase"("modelId", "sortOrder");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
