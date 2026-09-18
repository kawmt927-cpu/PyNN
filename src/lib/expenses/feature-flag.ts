/**
 * 报销模块开关：
 * 1) 环境变量 ENABLE_EXPENSE_REIMBURSEMENT 显式设置时强制覆盖（紧急关停用）
 * 2) 否则读后台「功能开关」表 AppFeatureFlags
 * 3) 库未初始化或无记录时：默认开启（正式能力）
 *
 * 注意：本文件被 middleware / permissions 同步导入，禁止顶层 import prisma。
 */

let cache: { value: boolean; at: number } | null = null;
const CACHE_TTL_MS = 15_000;

function envOverride(): boolean | null {
  const raw = process.env.ENABLE_EXPENSE_REIMBURSEMENT?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return null;
}

/** 库不可用时的兜底：默认开启 */
function fallbackWhenDbUnavailable() {
  return true;
}

async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export function invalidateExpenseFeatureFlagCache() {
  cache = null;
}

/** 同步读取（导航/中间件）；优先环境变量与短缓存 */
export function isExpenseFeatureEnabled() {
  const fromEnv = envOverride();
  if (fromEnv !== null) return fromEnv;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  return fallbackWhenDbUnavailable();
}

/** 服务端刷新缓存并返回当前值（布局/设置页应 await） */
export async function resolveExpenseFeatureEnabled() {
  const fromEnv = envOverride();
  if (fromEnv !== null) {
    cache = { value: fromEnv, at: Date.now() };
    return fromEnv;
  }
  try {
    const prisma = await getPrisma();
    const row = await prisma.appFeatureFlags.findUnique({
      where: { id: "default" },
      select: { expenseReimbursementEnabled: true },
    });
    const value = row?.expenseReimbursementEnabled ?? true;
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return fallbackWhenDbUnavailable();
  }
}

export async function getExpenseFeatureFlagForAdmin() {
  const fromEnv = envOverride();
  const prisma = await getPrisma();
  await prisma.appFeatureFlags.upsert({
    where: { id: "default" },
    create: { id: "default", expenseReimbursementEnabled: true },
    update: {},
  });
  const row = await prisma.appFeatureFlags.findUniqueOrThrow({
    where: { id: "default" },
    select: {
      expenseReimbursementEnabled: true,
      updatedAt: true,
      updatedBy: { select: { id: true, name: true } },
    },
  });
  return {
    expenseReimbursementEnabled: row.expenseReimbursementEnabled,
    updatedAt: row.updatedAt,
    updatedByName: row.updatedBy?.name ?? null,
    envOverride: fromEnv,
  };
}

export async function setExpenseFeatureFlag(enabled: boolean, updatedById: string) {
  const prisma = await getPrisma();
  await prisma.appFeatureFlags.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      expenseReimbursementEnabled: enabled,
      updatedById,
    },
    update: {
      expenseReimbursementEnabled: enabled,
      updatedById,
    },
  });
  invalidateExpenseFeatureFlagCache();
  cache = { value: enabled, at: Date.now() };
}
