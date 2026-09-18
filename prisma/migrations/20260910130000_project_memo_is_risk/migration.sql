-- AlterTable
ALTER TABLE "ProjectMemo" ADD COLUMN "isRisk" BOOLEAN NOT NULL DEFAULT false;

-- 旧「风险」分类迁为独立风险点 + 其它分类
UPDATE "ProjectMemo" SET "isRisk" = true, "category" = 'OTHER' WHERE "category" = 'RISK';

-- CreateIndex
CREATE INDEX "ProjectMemo_isRisk_createdAt_idx" ON "ProjectMemo"("isRisk", "createdAt");
