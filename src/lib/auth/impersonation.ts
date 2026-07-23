import { UserRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissions";

/** 全局展示顺序（管理员列表用） */
export const IMPERSONATION_ROLE_ORDER: UserRole[] = [
  "SALES_MANAGER",
  "SALES",
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "PROJECT_STAFF",
  "HR",
];

/** 各角色可切换到的目标角色 */
export const IMPERSONATION_TARGETS_BY_ACTOR: Partial<Record<UserRole, UserRole[]>> = {
  ADMIN: [...IMPERSONATION_ROLE_ORDER],
  SALES_MANAGER: ["SALES"],
  PROJECT_ADMIN: ["PROJECT_MANAGER", "PROJECT_STAFF"],
};

export type ImpersonationTarget = {
  id: string;
  name: string;
  role: UserRole;
  roleLabel: string;
};

export function getImpersonationTargetRoles(actorRole: UserRole): UserRole[] {
  return IMPERSONATION_TARGETS_BY_ACTOR[actorRole] ?? [];
}

export function canStartImpersonation(actorRole: UserRole): boolean {
  return getImpersonationTargetRoles(actorRole).length > 0;
}

export function canImpersonateTarget(actorRole: UserRole, targetRole: UserRole): boolean {
  return getImpersonationTargetRoles(actorRole).includes(targetRole);
}

export function sortImpersonationTargets<T extends { name: string; role: UserRole }>(
  users: T[]
): T[] {
  const order = new Map(IMPERSONATION_ROLE_ORDER.map((role, i) => [role, i]));
  return [...users].sort((a, b) => {
    const ra = order.get(a.role) ?? 999;
    const rb = order.get(b.role) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export function toImpersonationTargets(
  users: Array<{ id: string; name: string; role: UserRole }>
): ImpersonationTarget[] {
  return sortImpersonationTargets(users).map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role],
  }));
}

/** @deprecated 使用 IMPERSONATION_ROLE_ORDER */
export const DEBUG_IMPERSONATION_ROLE_ORDER = IMPERSONATION_ROLE_ORDER;
