-- AlterTable
ALTER TABLE "ProjectPhase" ADD COLUMN "progressWeight" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProjectModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectModelPhase" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "parallelGroup" INTEGER,
    "durationDays" INTEGER NOT NULL,
    "progressWeight" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("id"),
    CONSTRAINT "ProjectModelPhase_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProjectModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectModelPhase_modelId_sortOrder_idx" ON "ProjectModelPhase"("modelId", "sortOrder");
