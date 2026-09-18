-- 报销入口默认仅开放：管理员 / 销售管理 / 项目管理员
UPDATE "RolePermission"
SET
  "enabled" = CASE
    WHEN "role" IN ('ADMIN', 'SALES_MANAGER', 'PROJECT_ADMIN') THEN 1
    ELSE 0
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "permissionKey" IN ('expense.access', 'expense.proxy_beneficiary');
