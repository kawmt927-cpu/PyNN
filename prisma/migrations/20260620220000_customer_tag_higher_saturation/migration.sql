-- 客户标签预设色提高饱和度

UPDATE "ConfigOption"
SET "color" = CASE "color"
  WHEN '#d4dce4' THEN '#bfdbfe'
  WHEN '#cfd9e6' THEN '#bae6fd'
  WHEN '#ccdad4' THEN '#a7f3d0'
  WHEN '#d6dcc8' THEN '#bbf7d0'
  WHEN '#e0d5c8' THEN '#fde68a'
  WHEN '#e2d0d0' THEN '#fecdd3'
  WHEN '#d8d0e0' THEN '#ddd6fe'
  WHEN '#d0d8dc' THEN '#cbd5e1'
  ELSE "color"
END
WHERE "category" = 'customer_tag';

UPDATE "ConfigOption" SET "color" = '#bae6fd' WHERE "category" = 'customer_tag' AND "value" = 'TAG_KEY_ACCOUNT';
UPDATE "ConfigOption" SET "color" = '#ddd6fe' WHERE "category" = 'customer_tag' AND "value" = 'TAG_STRATEGIC';
UPDATE "ConfigOption" SET "color" = '#fecdd3' WHERE "category" = 'customer_tag' AND "value" = 'TAG_RISK';
