import { addDays, eachDayOfInterval, endOfMonth, format, isWeekend, startOfMonth } from "date-fns";
import { zhCN } from "date-fns/locale";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { getWeekRange } from "./week-range";
import { countWorkdays, toDateOnly } from "./workdays";

export const DAY_COLUMN_WIDTH = 36;
/** 资源排班大屏 — 周视图列宽 */
export const SCHEDULE_MODULE_DAY_WIDTH = 48;
/** 资源排班大屏 — 月视图列宽（更窄以容纳整月） */
export const SCHEDULE_MODULE_MONTH_DAY_WIDTH = 28;

export type ScheduleRangeMode = "month" | "week";

export type TimelineDay = {
  date: Date;
  dateKey: string;
  label: string;
  isWeekend: boolean;
};

export type SchedulePeriod = {
  mode: ScheduleRangeMode;
  from: Date;
  to: Date;
};

export function getMonthRange(reference = new Date()): SchedulePeriod {
  const ref = toDateOnly(reference);
  return {
    mode: "month",
    from: toDateOnly(startOfMonth(ref)),
    to: toDateOnly(endOfMonth(ref)),
  };
}

export function getWeekPeriod(reference = new Date()): SchedulePeriod {
  const from = getWeekRange(reference).from;
  return { mode: "week", from, to: addDays(from, 6) };
}

/** 兼容旧 week 参数；默认按月 */
export function parseSchedulePeriod(params: {
  range?: string;
  start?: string;
  week?: string;
}): SchedulePeriod {
  const mode: ScheduleRangeMode = params.range === "week" ? "week" : "month";

  const rawStart = params.start?.trim() || params.week?.trim();
  if (rawStart) {
    if (/^\d{4}-\d{2}$/.test(rawStart)) {
      const [y, m] = rawStart.split("-").map(Number);
      const ref = new Date(y, m - 1, 1);
      return mode === "week" ? getWeekPeriod(ref) : getMonthRange(ref);
    }
    const [y, m, d] = rawStart.split("-").map(Number);
    if (y && m && d) {
      const ref = toDateOnly(new Date(y, m - 1, d));
      return mode === "week" ? getWeekPeriod(ref) : getMonthRange(ref);
    }
  }

  return mode === "week" ? getWeekPeriod() : getMonthRange();
}

export function buildTimelineDays(period: SchedulePeriod): TimelineDay[] {
  const start = toDateOnly(period.from);
  const end = toDateOnly(period.to);
  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    dateKey: formatLocalDateInput(date),
    label:
      period.mode === "month"
        ? format(date, "d", { locale: zhCN })
        : format(date, "M/d EEE", { locale: zhCN }),
    isWeekend: isWeekend(date),
  }));
}

export function formatPeriodLabel(period: SchedulePeriod): string {
  if (period.mode === "month") {
    return format(period.from, "yyyy年M月", { locale: zhCN });
  }
  const days = buildTimelineDays(period);
  return `${formatLocalDateInput(days[0].date)} – ${formatLocalDateInput(days[days.length - 1].date)}`;
}

export function shiftPeriod(period: SchedulePeriod, delta: number): SchedulePeriod {
  if (period.mode === "month") {
    const next = new Date(period.from.getFullYear(), period.from.getMonth() + delta, 1);
    return getMonthRange(next);
  }
  return getWeekPeriod(addDays(period.from, delta * 7));
}

export function periodStartKey(period: SchedulePeriod): string {
  return formatLocalDateInput(period.from);
}

export function barStyleForRange(
  startDate: Date,
  endDate: Date,
  periodStart: Date,
  dayCount: number
): { left: string; width: string; visible: boolean } {
  const periodEnd = addDays(toDateOnly(periodStart), dayCount - 1);
  const barStart = toDateOnly(startDate);
  const barEnd = toDateOnly(endDate);
  if (barEnd < periodStart || barStart > periodEnd) {
    return { left: "0%", width: "0%", visible: false };
  }

  const visibleStart = barStart < periodStart ? periodStart : barStart;
  const visibleEnd = barEnd > periodEnd ? periodEnd : barEnd;
  const startIndex = Math.round(
    (visibleStart.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)
  );
  const span =
    Math.round(
      (visibleEnd.getTime() - visibleStart.getTime()) / (24 * 60 * 60 * 1000)
    ) + 1;

  const leftPct = (startIndex / dayCount) * 100;
  const widthPct = (span / dayCount) * 100;
  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 100 / dayCount / 2)}%`,
    visible: true,
  };
}

/** 拖拽新建投入时的默认日期区间（月视图取当前周内工作日） */
export function datesFromPeriodDrop(period: SchedulePeriod): {
  startDate: string;
  endDate: string;
} {
  if (period.mode === "week") {
    const days = buildTimelineDays(period).filter((d) => !d.isWeekend);
    return {
      startDate: days[0].dateKey,
      endDate: days[days.length - 1].dateKey,
    };
  }

  const today = toDateOnly(new Date());
  let anchor = today;
  if (today < period.from || today > period.to) {
    anchor = period.from;
  }
  const week = getWeekPeriod(anchor);
  const clipFrom = week.from < period.from ? period.from : week.from;
  const clipTo = week.to > period.to ? period.to : week.to;
  const days = eachDayOfInterval({ start: clipFrom, end: clipTo }).filter((d) => !isWeekend(d));
  if (days.length === 0) {
    return {
      startDate: formatLocalDateInput(period.from),
      endDate: formatLocalDateInput(period.from),
    };
  }
  return {
    startDate: formatLocalDateInput(days[0]),
    endDate: formatLocalDateInput(days[days.length - 1]),
  };
}

export function workdaysInPeriod(period: SchedulePeriod): number {
  return countWorkdays(period.from, period.to);
}

/** @deprecated 使用 parseSchedulePeriod */
export function parseWeekStartParam(value: string | undefined): Date {
  return parseSchedulePeriod({ range: "week", start: value }).from;
}

export function weekNavigationHref(basePath: string, weekStart: Date, deltaWeeks: number) {
  const next = addDays(weekStart, deltaWeeks * 7);
  const week = formatLocalDateInput(next);
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}week=${week}`;
}

export function datesFromWeekDrop(weekStart: Date, workdaysOnly = true): {
  startDate: string;
  endDate: string;
} {
  return datesFromPeriodDrop(getWeekPeriod(weekStart));
}

export type ScheduleModuleView = "global" | "detail";

/** 资源明细下的项目范围；`all` 表示全部项目甘特 */
export type ScheduleProjectScope = "all" | string;

export function parseScheduleView(value: string | undefined): ScheduleModuleView {
  if (value === "detail" || value === "project") return "detail";
  return "global";
}

export function parseScheduleProjectScope(
  value: string | undefined,
  projectIds: string[]
): ScheduleProjectScope {
  if (value === "all") return "all";
  if (value && projectIds.includes(value)) return value;
  return "all";
}

export function parseScheduleLocks(
  value: string | undefined,
  validStaffIds: string[]
): string[] {
  if (!value?.trim()) return [];
  const valid = new Set(validStaffIds);
  const ids: string[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (id && valid.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function buildScheduleModuleHref(params: {
  range?: ScheduleRangeMode;
  start?: string;
  view?: ScheduleModuleView;
  project?: ScheduleProjectScope;
  person?: string;
  /** 逗号分隔的人员 ID；传空数组表示清除锁定 */
  lock?: string[] | null;
  /** @deprecated 使用 start + range=week */
  week?: string;
}): string {
  const sp = new URLSearchParams();
  const range = params.range ?? (params.week ? "week" : "month");
  sp.set("range", range);
  if (params.start) sp.set("start", params.start);
  else if (params.week) sp.set("start", params.week);
  if (params.view) sp.set("view", params.view);
  if (params.project) sp.set("project", params.project);
  if (params.person) sp.set("person", params.person);
  if (params.lock !== undefined && params.lock !== null && params.lock.length > 0) {
    sp.set("lock", params.lock.join(","));
  }
  return `/projects/schedule?${sp.toString()}`;
}
