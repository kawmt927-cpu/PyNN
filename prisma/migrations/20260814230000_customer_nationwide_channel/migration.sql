-- 全国性渠道标记：仅全国性渠道可勾选覆盖省份
ALTER TABLE "Customer" ADD COLUMN "nationwideChannel" BOOLEAN NOT NULL DEFAULT false;

-- 已有覆盖省份的渠道视为全国性
UPDATE "Customer"
SET "nationwideChannel" = true
WHERE id IN (
  SELECT DISTINCT "customerId" FROM "CustomerCoverageProvince"
);
