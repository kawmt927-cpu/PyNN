import { CompanyCalendarDayKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isWorkday, toDateOnly } from "@/lib/projects/workdays";

/** 本地日历日 yyyy-MM-dd（与日报 logDate 一致） */
export function toDayKeyLocal(date: Date): string {
  const d = toDateOnly(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 内置兜底（国办 2025/2026）。库中有数据时优先生效；
 * 后续年份由 12 月 cron 从 holiday-cn 同步入库。
 */
export const BUILTIN_HOLIDAY_OFF = [
  // 2025
  "2025-01-01",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-01-31",
  "2025-02-01",
  "2025-02-02",
  "2025-02-03",
  "2025-02-04",
  "2025-04-04",
  "2025-04-05",
  "2025-04-06",
  "2025-05-01",
  "2025-05-02",
  "2025-05-03",
  "2025-05-04",
  "2025-05-05",
  "2025-05-31",
  "2025-06-01",
  "2025-06-02",
  "2025-10-01",
  "2025-10-02",
  "2025-10-03",
  "2025-10-04",
  "2025-10-05",
  "2025-10-06",
  "2025-10-07",
  "2025-10-08",
  // 2026
  "2026-01-01",
  "2026-01-02",
  "2026-01-03",
  "2026-02-15",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",
  "2026-02-21",
  "2026-02-22",
  "2026-02-23",
  "2026-04-04",
  "2026-04-05",
  "2026-04-06",
  "2026-05-01",
  "2026-05-02",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
] as const;

export const BUILTIN_MAKEUP_WORKDAYS = [
  // 2025
  "2025-01-26",
  "2025-02-08",
  "2025-04-27",
  "2025-09-28",
  "2025-10-11",
  // 2026
  "2026-01-04",
  "2026-02-14",
  "2026-02-28",
  "2026-05-09",
  "2026-09-20",
  "2026-10-10",
] as const;

type CalendarSets = {
  off: Set<string>;
  makeup: Set<string>;
};

let cache: CalendarSets | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

function builtinSets(): CalendarSets {
  return {
    off: new Set(BUILTIN_HOLIDAY_OFF),
    makeup: new Set(BUILTIN_MAKEUP_WORKDAYS),
  };
}

function activeSets(): CalendarSets {
  return cache ?? builtinSets();
}

/** 将库中公司日历载入内存（合并 builtin 兜底） */
export async function refreshCompanyCalendarCache() {
  const rows = await prisma.companyCalendarDay.findMany({
    select: { dayKey: true, kind: true },
  });
  const sets = builtinSets();
  for (const row of rows) {
    if (row.kind === CompanyCalendarDayKind.HOLIDAY_OFF) {
      sets.off.add(row.dayKey);
      sets.makeup.delete(row.dayKey);
    } else {
      sets.makeup.add(row.dayKey);
      sets.off.delete(row.dayKey);
    }
  }
  cache = sets;
  cacheLoadedAt = Date.now();
  return sets;
}

/** 懒加载 / 过期刷新；失败时继续用 builtin */
export async function ensureCompanyCalendarCache() {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  try {
    return await refreshCompanyCalendarCache();
  } catch {
    if (!cache) cache = builtinSets();
    return cache;
  }
}

export function invalidateCompanyCalendarCache() {
  cache = null;
  cacheLoadedAt = 0;
}

/**
 * 是否需提交日报：法定放假日与普通周末不考核；调休上班日照常考核。
 * 优先读内存缓存（库表），无缓存时用内置 2025/2026。
 */
export function isDailyReportRequiredDay(date: Date): boolean {
  const key = toDayKeyLocal(date);
  const { off, makeup } = activeSets();
  if (off.has(key)) return false;
  if (makeup.has(key)) return true;
  return isWorkday(date);
}

/** 公司出勤日、角色纳入日报考核、且该人当日无「免日报」请假 */
export async function isDailyReportRequiredForUser(
  userId: string,
  date: Date
): Promise<boolean> {
  await ensureCompanyCalendarCache();
  if (!isDailyReportRequiredDay(date)) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;

  const { hasPermission } = await import("@/lib/rbac/has-permission");
  if (!(await hasPermission(user.role, "daily_reports.required"))) return false;

  const { hasExemptDailyReportLeave } = await import("@/lib/personnel/leaves");
  const onLeave = await hasExemptDailyReportLeave(userId, toDayKeyLocal(date));
  return !onLeave;
}
