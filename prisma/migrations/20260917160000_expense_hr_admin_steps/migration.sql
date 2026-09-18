-- SQLite stores enums as TEXT; no ALTER TYPE needed.
-- Insert HR step between manager approval and admin payout.

-- In-flight「待打款」单先回到行政确认，避免跳过行政环节
UPDATE "ExpenseClaim" SET "status" = 'PENDING_HR' WHERE "status" = 'PENDING_PAYOUT';

-- 项目经理暂与项目人员同权：关掉经理原先多出的能力
UPDATE "RolePermission" SET "enabled" = 0
WHERE "role" = 'PROJECT_MANAGER'
  AND "permissionKey" IN (
    'nav.projects_schedule',
    'projects.schedule',
    'nav.contracts',
    'nav.contracts_external_costs',
    'contracts.attachments',
    'nav.admin_settings',
    'settings.project',
    'expense.be_approver'
  );

-- 报销上级审批人：销售管理 + 项目管理员
UPDATE "RolePermission" SET "enabled" = 1
WHERE "permissionKey" = 'expense.be_approver'
  AND "role" IN ('SALES_MANAGER', 'PROJECT_ADMIN');
UPDATE "RolePermission" SET "enabled" = 0
WHERE "permissionKey" = 'expense.be_approver'
  AND "role" NOT IN ('SALES_MANAGER', 'PROJECT_ADMIN');

-- 管理员终审打款（第三步）
UPDATE "RolePermission" SET "enabled" = 1
WHERE "permissionKey" = 'expense.finance_payout' AND "role" = 'ADMIN';
UPDATE "RolePermission" SET "enabled" = 0
WHERE "permissionKey" = 'expense.finance_payout' AND "role" != 'ADMIN';
