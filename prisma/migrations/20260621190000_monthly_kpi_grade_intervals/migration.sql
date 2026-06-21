-- ConfigOption: 客户等级往来间隔
ALTER TABLE "ConfigOption" ADD COLUMN "followUpIntervalDays" INTEGER;

-- SalesMonthlyTarget: 月度 KPI 目标
ALTER TABLE "SalesMonthlyTarget" ADD COLUMN "channelDevTarget" INTEGER;
ALTER TABLE "SalesMonthlyTarget" ADD COLUMN "projectDevTarget" INTEGER;
ALTER TABLE "SalesMonthlyTarget" ADD COLUMN "paymentCollectionTarget" DECIMAL;
ALTER TABLE "SalesMonthlyTarget" ADD COLUMN "maintenanceTarget" INTEGER;

-- SalesDailyLog: 提交时间（过程规范统计）
ALTER TABLE "SalesDailyLog" ADD COLUMN "submittedAt" DATETIME;

-- 全局 KPI 配置
CREATE TABLE "SalesKpiConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "projectDevMinStageValue" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "SalesKpiConfig" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

-- 默认等级往来间隔（天）
UPDATE "ConfigOption" SET "followUpIntervalDays" = 14 WHERE "category" = 'customer_grade' AND "value" = 'STAR_3';
UPDATE "ConfigOption" SET "followUpIntervalDays" = 30 WHERE "category" = 'customer_grade' AND "value" = 'STAR_2';
UPDATE "ConfigOption" SET "followUpIntervalDays" = 45 WHERE "category" = 'customer_grade' AND "value" = 'STAR_1';
UPDATE "ConfigOption" SET "followUpIntervalDays" = 60 WHERE "category" = 'customer_grade' AND "value" = 'NONE';
