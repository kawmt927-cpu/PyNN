-- 客户等级 NONE 显示名称改为「未评级」

UPDATE "ConfigOption" SET "label" = '未评级' WHERE "category" = 'customer_grade' AND "value" = 'NONE';
