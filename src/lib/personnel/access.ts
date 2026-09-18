import type { Prisma, UserRole } from "@prisma/client";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 计入「实施人员」名单的系统角色 */
export const IMPLEMENTATION_LIST_ROLES: UserRole[] = [
  "PROJECT_MANAGER",
  "PROJECT_STAFF",
];

/** 维护实施人员类型（排班用） */
export function canManagePersonnelInfo(role: UserRole) {
  return hasPermissionSync(role, "personnel.info");
}

/** 维护人员月成本（薪资类，归行政人事） */
export function canManagePersonnelCosts(role: UserRole) {
  return hasPermissionSync(role, "personnel.costs");
}

/** 员工档案与证件（全体员工，仅行政人事） */
export function canManageHrEmployees(role: UserRole) {
  return hasPermissionSync(role, "hr.employees");
}

export function canAccessPersonnelPage(role: UserRole) {
  return (
    canManagePersonnelInfo(role) || canManagePersonnelCosts(role)
  );
}

/**
 * 实施人员列表 / 资源排班人员池。
 * 仅「项目经理」「项目人员」；默认含离职（档案停用），activeOnly 时仅在职。
 */
export function implementationStaffListWhere(opts?: {
  activeOnly?: boolean;
}): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {
    role: { in: IMPLEMENTATION_LIST_ROLES },
  };
  if (opts?.activeOnly) {
    return {
      ...base,
      personnelProfile: { enabled: true },
    };
  }
  return base;
}

/** 离职且当月/本周期无排期时，不展示具体数值 */
export function shouldHideResignedPeriodMetrics(input: {
  resigned: boolean;
  periodEffectiveDays: number;
}): boolean {
  return input.resigned && input.periodEffectiveDays <= 0;
}
