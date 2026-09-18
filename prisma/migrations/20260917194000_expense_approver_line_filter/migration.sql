-- 关闭「自选任意审批人」：普通角色按销售→销管 / 项目→项管 选上级
UPDATE "RolePermission" SET "enabled" = 1
WHERE "permissionKey" = 'expense.pick_any_approver' AND "role" = 'ADMIN';

UPDATE "RolePermission" SET "enabled" = 0
WHERE "permissionKey" = 'expense.pick_any_approver' AND "role" != 'ADMIN';
