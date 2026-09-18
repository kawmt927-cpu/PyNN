-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN "progressPercent" INTEGER;

-- CreateTable
CREATE TABLE "ProjectMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "followStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectMemo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMemo_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMemoTask" (
    "memoId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    PRIMARY KEY ("memoId", "taskId"),
    CONSTRAINT "ProjectMemoTask_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "ProjectMemo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMemoTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectMemo_projectId_createdAt_idx" ON "ProjectMemo"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMemo_followStatus_createdAt_idx" ON "ProjectMemo"("followStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMemoTask_taskId_idx" ON "ProjectMemoTask"("taskId");
