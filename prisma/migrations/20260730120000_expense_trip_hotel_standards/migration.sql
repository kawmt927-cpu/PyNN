-- AlterTable: multi-segment trip fields
-- SQLite does not support ADD COLUMN IF NOT EXISTS in older versions; Prisma recreate pattern via table rebuild if needed.
-- Simple ADD COLUMN works on SQLite for new columns.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ExpenseTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "fromCity" TEXT,
    "city" TEXT,
    "customerId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseTrip_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExpenseTrip" ("id", "claimId", "sortOrder", "startDate", "endDate", "fromCity", "city", "customerId", "description", "createdAt")
SELECT "id", "claimId", 0, "startDate", "endDate", NULL, "city", "customerId", "description", "createdAt" FROM "ExpenseTrip";
DROP TABLE "ExpenseTrip";
ALTER TABLE "new_ExpenseTrip" RENAME TO "ExpenseTrip";
CREATE INDEX "ExpenseTrip_claimId_sortOrder_idx" ON "ExpenseTrip"("claimId", "sortOrder");

CREATE TABLE "ExpenseTravelPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "hotelCapTier1" DECIMAL NOT NULL DEFAULT 500,
    "hotelCapTier2" DECIMAL NOT NULL DEFAULT 400,
    "hotelCapTier3" DECIMAL NOT NULL DEFAULT 300,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "ExpenseTravelPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ExpenseCityTierMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityName" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ExpenseCityTierMapping_cityName_key" ON "ExpenseCityTierMapping"("cityName");
CREATE INDEX "ExpenseCityTierMapping_tier_enabled_sortOrder_idx" ON "ExpenseCityTierMapping"("tier", "enabled", "sortOrder");

INSERT INTO "ExpenseTravelPolicy" ("id", "hotelCapTier1", "hotelCapTier2", "hotelCapTier3", "updatedAt")
VALUES ('default', 500, 400, 300, CURRENT_TIMESTAMP);

INSERT INTO "ExpenseCityTierMapping" ("id", "cityName", "tier", "enabled", "sortOrder", "createdAt", "updatedAt") VALUES
  ('seed_city_bj', '北京', 'TIER_1', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_sh', '上海', 'TIER_1', 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_gz', '广州', 'TIER_1', 1, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_sz', '深圳', 'TIER_1', 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_hz', '杭州', 'TIER_2', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_nj', '南京', 'TIER_2', 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_wh', '武汉', 'TIER_2', 1, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_cd', '成都', 'TIER_2', 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_cq', '重庆', 'TIER_2', 1, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_tj', '天津', 'TIER_2', 1, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_su', '苏州', 'TIER_2', 1, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_xa', '西安', 'TIER_2', 1, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_cs', '长沙', 'TIER_2', 1, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_qd', '青岛', 'TIER_2', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_zz', '郑州', 'TIER_2', 1, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_dl', '大连', 'TIER_2', 1, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_nb', '宁波', 'TIER_2', 1, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_city_xm', '厦门', 'TIER_2', 1, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
