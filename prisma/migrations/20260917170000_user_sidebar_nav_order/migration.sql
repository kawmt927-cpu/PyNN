-- AlterTable
ALTER TABLE "User" ADD COLUMN "sidebarNavOrder" JSONB;

-- 个人设置入口对全员开放（侧栏排序等）
UPDATE "RolePermission" SET "enabled" = 1 WHERE "permissionKey" = 'nav.account';
