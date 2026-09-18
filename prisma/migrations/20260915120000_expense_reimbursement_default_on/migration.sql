-- 报销改为正式默认开启：新建行默认 true；已有关闭记录一并打开（可用 env 紧急关停）
UPDATE "AppFeatureFlags"
SET "expenseReimbursementEnabled" = true
WHERE "id" = 'default' AND "expenseReimbursementEnabled" = false;
