import { UserRole } from "@prisma/client";
import { canManageCustomerOwner } from "@/lib/customers/access";

export function canAccessSalesLog(role: UserRole) {
  return role === "SALES" || role === "SALES_MANAGER" || role === "ADMIN";
}

/** 销售管理/管理员可查看全员历史日报 */
export function canViewAllDailyReports(role: UserRole) {
  return canManageCustomerOwner(role);
}

export function salesCheckInListWhere(role: UserRole, userId: string) {
  if (canManageCustomerOwner(role)) return {};
  return { userId };
}

export function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
