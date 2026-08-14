-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "channelKind" TEXT;

-- CreateTable
CREATE TABLE "ChannelCoverageConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "integratorTarget" INTEGER NOT NULL DEFAULT 3,
    "hrpVendorTarget" INTEGER NOT NULL DEFAULT 3,
    "competitorTarget" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "ChannelCoverageConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "ChannelCoverageConfig" ("id", "integratorTarget", "hrpVendorTarget", "competitorTarget", "updatedAt")
VALUES ('default', 3, 3, 2, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "ConfigOption" ("id", "category", "value", "label", "sortOrder", "enabled")
VALUES
  ('seed_channel_kind_integrator', 'channel_kind', 'INTEGRATOR', '信息化集成商', 1, 1),
  ('seed_channel_kind_hrp', 'channel_kind', 'HRP_VENDOR', 'HRP 厂商', 2, 1),
  ('seed_channel_kind_competitor', 'channel_kind', 'COMPETITOR', '友商', 3, 1),
  ('seed_channel_kind_other', 'channel_kind', 'OTHER', '其他', 4, 1);
