-- 将客户标签颜色迁移为低饱和预设色

UPDATE "ConfigOption" SET "color" = '#cfd9e6' WHERE "category" = 'customer_tag' AND "value" = 'TAG_KEY_ACCOUNT';
UPDATE "ConfigOption" SET "color" = '#d8d0e0' WHERE "category" = 'customer_tag' AND "value" = 'TAG_STRATEGIC';
UPDATE "ConfigOption" SET "color" = '#e2d0d0' WHERE "category" = 'customer_tag' AND "value" = 'TAG_RISK';

UPDATE "ConfigOption"
SET "color" = '#d4dce4'
WHERE "category" = 'customer_tag'
  AND ("color" IS NULL OR "color" NOT IN (
    '#d4dce4', '#cfd9e6', '#ccdad4', '#d6dcc8',
    '#e0d5c8', '#e2d0d0', '#d8d0e0', '#d0d8dc'
  ));
