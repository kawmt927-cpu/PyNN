import type { UserRole } from "@prisma/client";

/** 可使用销售移动端 `/mobile` 的角色 */
export const SALES_MOBILE_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export function canAccessSalesMobile(role: UserRole): boolean {
  return SALES_MOBILE_ROLES.includes(role);
}
