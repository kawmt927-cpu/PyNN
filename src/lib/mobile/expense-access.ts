import type { UserRole } from "@prisma/client";
import { DEFAULT_ENABLED_ROLES } from "@/lib/rbac/permission-keys";

/** 可使用手机端报销 `/mobile/expenses` 的角色（与 expense.access 默认矩阵一致） */
export const EXPENSE_MOBILE_ROLES: UserRole[] = [
  ...(DEFAULT_ENABLED_ROLES["expense.access"] as readonly UserRole[]),
];

export function canAccessExpenseMobile(role: UserRole): boolean {
  return (EXPENSE_MOBILE_ROLES as string[]).includes(role);
}

export function isExpenseMobilePath(pathname: string): boolean {
  return pathname === "/mobile/expenses" || pathname.startsWith("/mobile/expenses/");
}
