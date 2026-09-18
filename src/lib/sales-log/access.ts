import { UserRole } from "@prisma/client";
import { canManageCustomerOwner } from "@/lib/customers/access";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

export function canAccessSalesLog(role: UserRole) {
  return hasPermissionSync(role, "nav.today_work");
}

/** 销售管理/管理员可查看全员历史日报 */
export function canViewAllDailyReports(role: UserRole) {
  return hasPermissionSync(role, "daily_reports.view_all") || canManageCustomerOwner(role);
}

export function salesCheckInListWhere(role: UserRole, userId: string) {
  if (canManageCustomerOwner(role)) return {};
  return { userId };
}

export function getDayRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getTodayRange() {
  return getDayRange(new Date());
}
