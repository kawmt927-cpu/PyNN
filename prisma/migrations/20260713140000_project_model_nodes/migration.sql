-- 项目模型关键节点（无工期里程碑）
CREATE TABLE "ProjectModelNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "timeRef" TEXT NOT NULL DEFAULT 'PROJECT_START',
    "timeOffset" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProjectModelNode_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProjectModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProjectModelNode_modelId_sortOrder_idx" ON "ProjectModelNode"("modelId", "sortOrder");
