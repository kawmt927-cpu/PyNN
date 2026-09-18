import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  type PermissionKey,
  type RoleUserCounts,
  defaultPermissionEnabled,
  isPermissionKey,
} from "@/lib/rbac/permission-keys";
import {
  resolvePrimaryNav,
  toNavItems,
  type NavItem,
} from "@/lib/nav/primary-nav";

export type { RoleUserCounts };
export type { NavItem };

/** 请求内缓存，避免同一次渲染重复查库 */
const cache = new Map<string, boolean>();
const preloadedRoles = new Set<string>();

export function clearPermissionCache() {
  cache.clear();
  preloadedRoles.clear();
}

function cacheKey(role: UserRole, key: PermissionKey) {
  return `${role}:${key}`;
}

function setCached(role: UserRole, key: PermissionKey, enabled: boolean) {
  if (role === "ADMIN" && key === "admin.manage_roles") {
    cache.set(cacheKey(role, key), true);
    return;
  }
  cache.set(cacheKey(role, key), enabled);
}

/** 幂等写入默认矩阵（仅补缺失行，不覆盖管理员已改的值） */
export async function ensureDefaultRolePermissions() {
  const existing = await prisma.rolePermission.findMany({
    select: { role: true, permissionKey: true },
  });
  const have = new Set(existing.map((r) => `${r.role}:${r.permissionKey}`));
  const toCreate: Array<{ role: UserRole; permissionKey: string; enabled: boolean }> = [];
  for (const role of ALL_ROLES) {
    for (const key of PERMISSION_KEYS) {
      if (have.has(`${role}:${key}`)) continue;
      toCreate.push({
        role,
        permissionKey: key,
        enabled: defaultPermissionEnabled(role, key),
      });
    }
  }
  if (toCreate.length > 0) {
    await prisma.rolePermission.createMany({ data: toCreate });
  }
}

/** 预加载某角色全部权限到请求缓存，供同步 can* 使用 */
export async function preloadRolePermissions(role: UserRole | string | null | undefined) {
  if (!role) return;
  const roleKey = role as UserRole;
  if (preloadedRoles.has(roleKey)) return;

  try {
    await ensureDefaultRolePermissions();
    const rows = await prisma.rolePermission.findMany({
      where: { role: roleKey },
      select: { permissionKey: true, enabled: true },
    });
    const byKey = new Map(rows.map((r) => [r.permissionKey, r.enabled]));
    for (const key of PERMISSION_KEYS) {
      const enabled = byKey.has(key)
        ? Boolean(byKey.get(key))
        : defaultPermissionEnabled(roleKey, key);
      setCached(roleKey, key, enabled);
    }
    preloadedRoles.add(roleKey);
  } catch {
    for (const key of PERMISSION_KEYS) {
      setCached(roleKey, key, defaultPermissionEnabled(roleKey, key));
    }
    preloadedRoles.add(roleKey);
  }
}

/**
 * 同步读权限：优先请求缓存（需先 preloadRolePermissions），否则回退默认矩阵。
 * 供现有同步 can* 门禁使用。
 */
export function hasPermissionSync(
  role: UserRole | string | null | undefined,
  key: PermissionKey
): boolean {
  if (!role) return false;
  const roleKey = role as UserRole;
  if (roleKey === "ADMIN" && key === "admin.manage_roles") return true;
  const hit = cache.get(cacheKey(roleKey, key));
  if (hit !== undefined) return hit;
  return defaultPermissionEnabled(roleKey, key);
}

export async function hasPermission(
  role: UserRole | string | null | undefined,
  key: PermissionKey
): Promise<boolean> {
  if (!role) return false;
  const roleKey = role as UserRole;
  const ck = cacheKey(roleKey, key);
  if (cache.has(ck)) return cache.get(ck)!;

  if (roleKey === "ADMIN" && key === "admin.manage_roles") {
    cache.set(ck, true);
    return true;
  }

  try {
    const row = await prisma.rolePermission.findUnique({
      where: { role_permissionKey: { role: roleKey, permissionKey: key } },
      select: { enabled: true },
    });
    const enabled = row ? row.enabled : defaultPermissionEnabled(roleKey, key);
    cache.set(ck, enabled);
    return enabled;
  } catch {
    const enabled = defaultPermissionEnabled(roleKey, key);
    cache.set(ck, enabled);
    return enabled;
  }
}

export async function getRolePermissionMap(
  role: UserRole
): Promise<Record<PermissionKey, boolean>> {
  await ensureDefaultRolePermissions();
  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permissionKey: true, enabled: true },
  });
  const map = { ...DEFAULT_ROLE_PERMISSIONS[role] };
  for (const row of rows) {
    if (isPermissionKey(row.permissionKey)) {
      map[row.permissionKey] = row.enabled;
    }
  }
  if (role === "ADMIN") {
    map["admin.manage_roles"] = true;
  }
  return map;
}

export async function listUsersByRole(role: UserRole) {
  return prisma.user.findMany({
    where: { role },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      personnelProfile: { select: { enabled: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function countUsersByRole(): Promise<RoleUserCounts> {
  const empty = Object.fromEntries(ALL_ROLES.map((r) => [r, 0])) as Record<UserRole, number>;
  const [all, resigned] = await Promise.all([
    prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      where: { personnelProfile: { enabled: false } },
      _count: { _all: true },
    }),
  ]);
  const total = { ...empty };
  const resignedMap = { ...empty };
  for (const g of all) {
    total[g.role] = g._count._all;
  }
  for (const g of resigned) {
    resignedMap[g.role] = g._count._all;
  }
  const active = { ...empty };
  for (const role of ALL_ROLES) {
    active[role] = Math.max(0, total[role] - resignedMap[role]);
  }
  return { total, active };
}

/** Dashboard 侧栏：按 RolePermission 表过滤的一级入口 */
export async function getNavForRoleAsync(role: UserRole): Promise<NavItem[]> {
  await preloadRolePermissions(role);
  return toNavItems(resolvePrimaryNav(role, hasPermissionSync));
}

