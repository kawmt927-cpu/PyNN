import { CompanyCalendarDayKind } from "@prisma/client";
import {
  BUILTIN_HOLIDAY_OFF,
  BUILTIN_MAKEUP_WORKDAYS,
  invalidateCompanyCalendarCache,
  refreshCompanyCalendarCache,
} from "@/lib/calendar/cn-daily-report-days";
import {
  createAppNotification,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/app-notifications";
import { prisma } from "@/lib/prisma";

const HOLIDAY_CN_URLS = (year: number) => [
  `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
];

type HolidayCnDay = {
  name: string;
  date: string;
  isOffDay: boolean;
};

type HolidayCnYear = {
  year: number;
  papers?: string[];
  days: HolidayCnDay[];
};

export type CompanyCalendarSyncResult = {
  year: number;
  status: "ok" | "skipped" | "pending" | "failed";
  dayCount: number;
  message: string;
  papers?: string[];
};

/** 12 月 10–31 日自动拉「明年」；其他时间需显式 year */
export function resolveCompanyCalendarSyncYear(
  now = new Date(),
  explicitYear?: number | null
): { year: number | null; reason?: string } {
  if (explicitYear && Number.isFinite(explicitYear) && explicitYear >= 2024) {
    return { year: Math.trunc(explicitYear) };
  }
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (month === 12 && day >= 10) {
    return { year: now.getFullYear() + 1 };
  }
  return {
    year: null,
    reason:
      "当前不在 12 月 10–31 自动同步窗口；请传 year=YYYY，或等到 12 月中旬自动拉明年",
  };
}

async function listAdminHrUserIds() {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "HR"] },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function notifyCalendarSync(input: {
  title: string;
  body: string;
  year: number;
  status: string;
}) {
  const recipientUserIds = await listAdminHrUserIds();
  if (recipientUserIds.length === 0) return;
  await createAppNotification({
    type: NOTIFICATION_TYPES.COMPANY_CALENDAR_SYNC,
    title: input.title,
    body: input.body,
    recipientUserIds,
    meta: { year: input.year, status: input.status },
    pushWeCom: true,
  });
}

/** 将内置 2025/2026 写入库（仅补缺，不覆盖 manual / 已同步日） */
export async function seedBuiltinCompanyCalendar() {
  const existing = await prisma.companyCalendarDay.findMany({
    select: { dayKey: true },
  });
  const have = new Set(existing.map((r) => r.dayKey));
  const rows: {
    dayKey: string;
    year: number;
    kind: CompanyCalendarDayKind;
    name: string;
    source: string;
  }[] = [];

  for (const dayKey of BUILTIN_HOLIDAY_OFF) {
    if (have.has(dayKey)) continue;
    rows.push({
      dayKey,
      year: Number(dayKey.slice(0, 4)),
      kind: CompanyCalendarDayKind.HOLIDAY_OFF,
      name: "法定放假",
      source: "builtin",
    });
  }
  for (const dayKey of BUILTIN_MAKEUP_WORKDAYS) {
    if (have.has(dayKey)) continue;
    rows.push({
      dayKey,
      year: Number(dayKey.slice(0, 4)),
      kind: CompanyCalendarDayKind.MAKEUP_WORKDAY,
      name: "调休上班",
      source: "builtin",
    });
  }

  if (rows.length > 0) {
    await prisma.companyCalendarDay.createMany({ data: rows });
  }
  invalidateCompanyCalendarCache();
  await refreshCompanyCalendarCache();
  return { inserted: rows.length };
}

async function fetchHolidayCnYear(year: number): Promise<HolidayCnYear> {
  let lastError = "未知错误";
  for (const url of HOLIDAY_CN_URLS(year)) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 404) {
        lastError = `尚未发布 ${year} 年数据（404）`;
        continue;
      }
      if (!res.ok) {
        lastError = `${url} HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as HolidayCnYear;
      if (!data?.days?.length || data.year !== year) {
        lastError = "返回 JSON 无效或年份不匹配";
        continue;
      }
      return data;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError);
}

async function upsertYearSync(input: {
  year: number;
  status: string;
  dayCount: number;
  papersJson?: string | null;
  message: string;
  syncedAt?: Date | null;
}) {
  await prisma.companyCalendarYearSync.upsert({
    where: { year: input.year },
    create: {
      year: input.year,
      status: input.status,
      dayCount: input.dayCount,
      papersJson: input.papersJson ?? undefined,
      message: input.message,
      syncedAt: input.syncedAt ?? undefined,
    },
    update: {
      status: input.status,
      dayCount: input.dayCount,
      papersJson: input.papersJson ?? undefined,
      message: input.message,
      syncedAt: input.syncedAt ?? undefined,
    },
  });
}

/**
 * 从 NateScarlet/holiday-cn 同步指定年份法定假/调休到 CompanyCalendarDay。
 * 不覆盖 source=manual 的手工日（留给后期行政模块）。
 */
export async function syncCompanyCalendarYear(input: {
  year: number;
  force?: boolean;
  notify?: boolean;
}): Promise<CompanyCalendarSyncResult> {
  const { year, force = false, notify = true } = input;

  const prev = await prisma.companyCalendarYearSync.findUnique({
    where: { year },
  });
  if (prev?.status === "ok" && prev.dayCount > 0 && !force) {
    return {
      year,
      status: "skipped",
      dayCount: prev.dayCount,
      message: `${year} 年已同步成功，跳过（传 force=1 可重拉）`,
      papers: prev.papersJson ? (JSON.parse(prev.papersJson) as string[]) : undefined,
    };
  }

  try {
    const data = await fetchHolidayCnYear(year);
    const manuals = await prisma.companyCalendarDay.findMany({
      where: { year, source: "manual" },
      select: { dayKey: true },
    });
    const manualKeys = new Set(manuals.map((r) => r.dayKey));

    await prisma.companyCalendarDay.deleteMany({
      where: { year, source: { not: "manual" } },
    });

    const rows = data.days
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && !manualKeys.has(d.date))
      .map((d) => ({
        dayKey: d.date,
        year,
        kind: d.isOffDay
          ? CompanyCalendarDayKind.HOLIDAY_OFF
          : CompanyCalendarDayKind.MAKEUP_WORKDAY,
        name: d.name || null,
        source: "holiday-cn",
      }));

    if (rows.length === 0) {
      throw new Error("解析后无有效日期");
    }

    await prisma.companyCalendarDay.createMany({ data: rows });
    const papersJson = data.papers?.length ? JSON.stringify(data.papers) : null;
    const message = `已同步 ${rows.length} 天（放假/调休）；手工日保留 ${manualKeys.size} 条`;
    await upsertYearSync({
      year,
      status: "ok",
      dayCount: rows.length,
      papersJson,
      message,
      syncedAt: new Date(),
    });
    invalidateCompanyCalendarCache();
    await refreshCompanyCalendarCache();

    if (notify) {
      await notifyCalendarSync({
        year,
        status: "ok",
        title: `${year} 年法定节假日已入库`,
        body: message,
      });
    }

    return {
      year,
      status: "ok",
      dayCount: rows.length,
      message,
      papers: data.papers,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await upsertYearSync({
      year,
      status: "pending",
      dayCount: prev?.dayCount ?? 0,
      papersJson: prev?.papersJson,
      message: errMsg,
      syncedAt: prev?.syncedAt ?? null,
    });

    if (notify) {
      await notifyCalendarSync({
        year,
        status: "pending",
        title: `${year} 年法定节假日尚未同步`,
        body: `${errMsg}。窗口期内将自动重试；也可手动 force 拉取。`,
      });
    }

    return {
      year,
      status: "pending",
      dayCount: prev?.dayCount ?? 0,
      message: errMsg,
    };
  }
}

/** cron 入口：窗口内拉明年，并确保 builtin 已落库 */
export async function runCompanyCalendarSyncJob(input?: {
  year?: number | null;
  force?: boolean;
  now?: Date;
}): Promise<CompanyCalendarSyncResult & { builtinSeeded?: number }> {
  const seeded = await seedBuiltinCompanyCalendar();
  const resolved = resolveCompanyCalendarSyncYear(input?.now ?? new Date(), input?.year);
  if (!resolved.year) {
    return {
      year: 0,
      status: "skipped",
      dayCount: 0,
      message: resolved.reason ?? "跳过",
      builtinSeeded: seeded.inserted,
    };
  }
  const result = await syncCompanyCalendarYear({
    year: resolved.year,
    force: input?.force,
    notify: true,
  });
  return { ...result, builtinSeeded: seeded.inserted };
}
