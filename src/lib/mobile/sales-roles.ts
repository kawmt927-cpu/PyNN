import type { UserRole } from "@prisma/client";

/** 可使用销售移动端 `/mobile` 的角色 */
export const SALES_MOBILE_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

/** 管理视角（无本人打卡/写日报底栏） */
export const MOBILE_MANAGER_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];

export function canAccessSalesMobile(role: UserRole): boolean {
  return SALES_MOBILE_ROLES.includes(role);
}

export function isMobileManagerRole(role: UserRole): boolean {
  return MOBILE_MANAGER_ROLES.includes(role);
}

/** 手机端登录后的默认落地页 */
export function getMobileHomeForRole(role: UserRole): string {
  if (canAccessSalesMobile(role)) return "/mobile";
  return "/mobile/pc-only";
}
