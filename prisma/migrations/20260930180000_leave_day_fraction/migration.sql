-- AlterTable: 请假日半天粒度；关账出勤天数支持小数
ALTER TABLE "PersonnelLeaveDay" ADD COLUMN "dayFraction" REAL NOT NULL DEFAULT 1;
-- SQLite 无直接改列类型；Prisma Float 与既有 INTEGER 兼容读出，重建为 REAL 语义由应用侧使用小数。
-- attendanceDays 保持可空数值列（SQLite 动态类型，已有 Int 值仍可读）。
