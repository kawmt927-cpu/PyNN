-- AlterTable
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "confirmedAt" DATETIME;

-- 历史数据视为已确认，避免线上人力成本突然归零
UPDATE "PersonnelMonthlyCostAdjustment"
SET "confirmedAt" = coalesce("updatedAt", "createdAt")
WHERE "confirmedAt" IS NULL;

-- CreateIndex
CREATE INDEX "PersonnelMonthlyCostAdjustment_confirmedAt_idx" ON "PersonnelMonthlyCostAdjustment"("confirmedAt");
