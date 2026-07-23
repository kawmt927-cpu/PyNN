import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isWeekend,
  startOfMonth,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { parseDateOnlyInput } from "@/lib/validations/project";
import { getWeekRange } from "./week-range";
import { countCalendarDays, maxDate, minDate, toDateOnly } from "./workdays";

export const DAY_COLUMN_WIDTH = 36;
/** 资源排班大屏 — 周视图列宽 */
export const SCHEDULE_MODULE_DAY_WIDTH = 48;
/** 资源排班大屏 — 月视图列宽（更窄以容纳整月） */
export const SCHEDULE_MODULE_MONTH_DAY_WIDTH = 28;
/** 自定义周期最长天数（约 3 年） */
export const SCHEDULE_CUSTOM_MAX_DAYS = 1096;
/** 长周期下单日列最小宽度（px） */
export const SCHEDULE_DAY_WIDTH_MIN = 4;

export type ScheduleRangeMode = "month" | "week" | "custom";

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

export function getCustomPeriod(fromInput: Date, toInput: Date): SchedulePeriod {
  let from = toDateOnly(fromInput);
  let to = toDateOnly(toInput);
  if (from.getTime() > to.getTime()) {
    const swap = from;
    from = to;
    to = swap;
  }
  const span = countCalendarDays(from, to);
  if (span > SCHEDULE_CUSTOM_MAX_DAYS) {
    to = addDays(from, SCHEDULE_CUSTOM_MAX_DAYS - 1);
  }
  return { mode: "custom", from, to };
}

function asDateOnlyFromUnknown(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toDateOnly(value);
  }
  const text = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return toDateOnly(parseDateOnlyInput(text));
}

export type ProjectScheduleDates = {
  plannedStartAt?: Date | string | null;
  plannedEndAt?: Date | string | null;
  actualStartAt?: Date | string | null;
  actualEndAt?: Date | string | null;
};

/**
 * 从项目预计/实际起止中取最早与最晚，得到自定义周期最长跨度。
 * 无任何有效日期时返回 null。
 */
export function customRangeFromProjectDates(
  dates: ProjectScheduleDates
): { start: string; end: string } | null {
  const points = [
    asDateOnlyFromUnknown(dates.plannedStartAt),
    asDateOnlyFromUnknown(dates.plannedEndAt),
    asDateOnlyFromUnknown(dates.actualStartAt),
    asDateOnlyFromUnknown(dates.actualEndAt),
  ].filter((d): d is Date => d != null);

  if (points.length === 0) return null;

  let from = points[0];
  let to = points[0];
  for (const point of points.slice(1)) {
    if (point.getTime() < from.getTime()) from = point;
    if (point.getTime() > to.getTime()) to = point;
  }

  const period = getCustomPeriod(from, to);
  return {
    start: formatLocalDateInput(period.from),
    end: formatLocalDateInput(period.to),
  };
}

/**
 * 排班允许区间：开始 ≥ min(计划开始, 实际开始)；结束 ≤ max(计划结束, 实际结束)。
 * 某一侧无有效日期时该侧不限制。
 */
export function projectAllocationDateBounds(dates: ProjectScheduleDates): {
  minStart: Date | null;
  maxEnd: Date | null;
} {
  const starts = [
    asDateOnlyFromUnknown(dates.plannedStartAt),
    asDateOnlyFromUnknown(dates.actualStartAt),
  ].filter((d): d is Date => d != null);
  const ends = [
    asDateOnlyFromUnknown(dates.plannedEndAt),
    asDateOnlyFromUnknown(dates.actualEndAt),
  ].filter((d): d is Date => d != null);

  let minStart: Date | null = null;
  for (const day of starts) {
    if (!minStart || day.getTime() < minStart.getTime()) minStart = day;
  }
  let maxEnd: Date | null = null;
  for (const day of ends) {
    if (!maxEnd || day.getTime() > maxEnd.getTime()) maxEnd = day;
  }
  return { minStart, maxEnd };
}

export function allocationDatesOutsideProjectBoundsError(
  startDate: Date | string,
  endDate: Date | string,
  dates: ProjectScheduleDates
): string | null {
  const { minStart, maxEnd } = projectAllocationDateBounds(dates);
  const start =
    typeof startDate === "string"
      ? toDateOnly(parseDateOnlyInput(startDate.slice(0, 10)))
      : toDateOnly(startDate);
  const end =
    typeof endDate === "string"
      ? toDateOnly(parseDateOnlyInput(endDate.slice(0, 10)))
      : toDateOnly(endDate);

  if (minStart && start.getTime() < minStart.getTime()) {
    return `开始日期不能早于项目开始（${formatLocalDateInput(minStart)}）`;
  }
  if (maxEnd && end.getTime() > maxEnd.getTime()) {
    return `结束日期不能晚于项目结束（${formatLocalDateInput(maxEnd)}）`;
  }
  return null;
}

/**
 * 新建投入默认日期：从今天起（夹到项目开始边界）到项目允许的结束日。
 * 无项目日期时退回为单日（今天）。
 */
export function defaultAllocationDates(
  projectDates?: ProjectScheduleDates | null
): { startDate: string; endDate: string } {
  const today = toDateOnly(new Date());
  if (!projectDates) {
    const key = formatLocalDateInput(today);
    return { startDate: key, endDate: key };
  }

  const { minStart, maxEnd } = projectAllocationDateBounds(projectDates);
  let start = today;
  if (minStart && start.getTime() < minStart.getTime()) start = toDateOnly(minStart);
  if (maxEnd && start.getTime() > maxEnd.getTime()) start = toDateOnly(maxEnd);

  let end = maxEnd ? toDateOnly(maxEnd) : start;
  if (end.getTime() < start.getTime()) end = start;

  return {
    startDate: formatLocalDateInput(start),
    endDate: formatLocalDateInput(end),
  };
}

/** 将分段日期夹到项目允许区间内（无边界时原样返回） */
export function clampAllocationDatesToProjectBounds(
  dates: { startDate: string; endDate: string },
  projectDates: ProjectScheduleDates
): { startDate: string; endDate: string } {
  const { minStart, maxEnd } = projectAllocationDateBounds(projectDates);
  if (!minStart && !maxEnd) return dates;

  let start = toDateOnly(parseDateOnlyInput(dates.startDate.slice(0, 10)));
  let end = toDateOnly(parseDateOnlyInput(dates.endDate.slice(0, 10)));

  if (minStart && start.getTime() < minStart.getTime()) start = minStart;
  if (maxEnd && end.getTime() > maxEnd.getTime()) end = maxEnd;
  if (minStart && end.getTime() < minStart.getTime()) end = minStart;
  if (maxEnd && start.getTime() > maxEnd.getTime()) start = maxEnd;
  if (start.getTime() > end.getTime()) end = start;

  return {
    startDate: formatLocalDateInput(start),
    endDate: formatLocalDateInput(end),
  };
}

/** 兼容旧 week 参数；默认按月 */
export function parseSchedulePeriod(params: {
  range?: string;
  start?: string;
  end?: string;
  week?: string;
}): SchedulePeriod {
  const mode: ScheduleRangeMode =
    params.range === "week" ? "week" : params.range === "custom" ? "custom" : "month";

  if (mode === "custom") {
    const rawStart = params.start?.trim();
    const rawEnd = params.end?.trim() || rawStart;
    if (rawStart && /^\d{4}-\d{2}-\d{2}$/.test(rawStart.slice(0, 10))) {
      const from = parseDateOnlyInput(rawStart.slice(0, 10));
      const endStr =
        rawEnd && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd.slice(0, 10))
          ? rawEnd.slice(0, 10)
          : formatLocalDateInput(addDays(from, 6));
      return getCustomPeriod(from, parseDateOnlyInput(endStr));
    }
    const week = getWeekPeriod();
    return getCustomPeriod(week.from, week.to);
  }

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
  const dayCount = countCalendarDays(start, end);
  return eachDayOfInterval({ start, end }).map((date) => {
    let label: string;
    if (period.mode === "week" || (period.mode === "custom" && dayCount <= 14)) {
      label = format(date, "M/d EEE", { locale: zhCN });
    } else if (dayCount > 180) {
      // 半年以上：仅月初标月份，其余留空避免挤成一团
      label = date.getDate() === 1 ? format(date, "M月", { locale: zhCN }) : "";
    } else if (dayCount > 60) {
      // 约 2～6 个月：月初标 M/d，其余仅日号过密时隔天显示
      if (date.getDate() === 1) label = format(date, "M/d", { locale: zhCN });
      else if (date.getDate() % 2 === 1) label = format(date, "d", { locale: zhCN });
      else label = "";
    } else {
      label = format(date, "d", { locale: zhCN });
    }
    return {
      date,
      dateKey: formatLocalDateInput(date),
      label,
      isWeekend: isWeekend(date),
    };
  });
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
  if (period.mode === "custom") {
    const span = countCalendarDays(period.from, period.to);
    return getCustomPeriod(
      addDays(period.from, delta * span),
      addDays(period.to, delta * span)
    );
  }
  return getWeekPeriod(addDays(period.from, delta * 7));
}

export function periodStartKey(period: SchedulePeriod): string {
  if (period.mode === "month") {
    const month = String(period.from.getMonth() + 1).padStart(2, "0");
    return `${period.from.getFullYear()}-${month}`;
  }
  return formatLocalDateInput(period.from);
}

export function periodEndKey(period: SchedulePeriod): string {
  return formatLocalDateInput(period.to);
}

/** 当前视图所属月份（周/自定义取区间中点所在月，避免跨月误判） */
export function periodSelectedMonthKey(period: SchedulePeriod): string {
  const ref =
    period.mode === "month"
      ? period.from
      : addDays(
          period.from,
          Math.floor(countCalendarDays(period.from, period.to) / 2)
        );
  const month = String(ref.getMonth() + 1).padStart(2, "0");
  return `${ref.getFullYear()}-${month}`;
}

/** 按月 / 按周 / 自定义切换时的 start（及自定义默认 end） */
export function periodRangeSwitchStart(
  period: SchedulePeriod,
  targetMode: ScheduleRangeMode
): string {
  if (targetMode === "custom") {
    return formatLocalDateInput(period.from);
  }
  const monthKey = periodSelectedMonthKey(period);
  return targetMode === "month" ? monthKey : `${monthKey}-01`;
}

export function periodRangeSwitchEnd(period: SchedulePeriod): string {
  return formatLocalDateInput(period.to);
}

export function scheduleDayWidth(period: SchedulePeriod): number {
  if (period.mode === "week") return SCHEDULE_MODULE_DAY_WIDTH;

  const days = countCalendarDays(period.from, period.to);
  if (period.mode === "month") return SCHEDULE_MODULE_MONTH_DAY_WIDTH;

  // 自定义：区间越长，单日列越窄，保证最长约 3 年仍可横向浏览
  if (days <= 14) return SCHEDULE_MODULE_DAY_WIDTH;
  if (days <= 45) return SCHEDULE_MODULE_MONTH_DAY_WIDTH;
  if (days <= 90) return 16;
  if (days <= 180) return 10;
  if (days <= 365) return 6;
  if (days <= 730) return 5;
  return SCHEDULE_DAY_WIDTH_MIN;
}

/**
 * 按右侧可视宽度拉宽单日列，避免周期较短时右侧大片留白；
 * 内容已超出视口时保持基础列宽，继续横向滚动。
 */
export function fitScheduleDayWidth(params: {
  period: SchedulePeriod;
  dayCount: number;
  containerWidth: number;
  sideLabelWidth: number;
}): number {
  const base = scheduleDayWidth(params.period);
  if (params.dayCount <= 0 || params.containerWidth <= 0) return base;
  const available = params.containerWidth - params.sideLabelWidth;
  if (available <= 0) return base;
  const natural = params.dayCount * base;
  if (natural >= available) return base;
  return Math.max(base, Math.floor(available / params.dayCount));
}

export function barStyleForRange(
  startDate: Date,
  endDate: Date,
  periodStart: Date,
  dayCount: number,
  dayWidth?: number
): { left: string; width: string; visible: boolean } {
  const periodStartDay = toDateOnly(periodStart);
  const periodEnd = addDays(periodStartDay, dayCount - 1);
  const barStart = toDateOnly(startDate);
  const barEnd = toDateOnly(endDate);
  if (barEnd < periodStartDay || barStart > periodEnd) {
    return { left: "0%", width: "0%", visible: false };
  }

  const visibleStart = barStart < periodStartDay ? periodStartDay : barStart;
  const visibleEnd = barEnd > periodEnd ? periodEnd : barEnd;
  const startIndex = differenceInCalendarDays(visibleStart, periodStartDay);
  const span = differenceInCalendarDays(visibleEnd, visibleStart) + 1;

  // 与日期列同用像素定位，避免父容器被 flex 拉宽后百分比错位
  if (dayWidth != null && dayWidth > 0) {
    return {
      left: `${startIndex * dayWidth}px`,
      width: `${Math.max(span, 0.5) * dayWidth}px`,
      visible: true,
    };
  }

  const leftPct = (startIndex / dayCount) * 100;
  const widthPct = (span / dayCount) * 100;
  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 100 / dayCount / 2)}%`,
    visible: true,
  };
}

/** 拖拽新建投入时的默认日期：从本日开始（落在周期外则夹到周期边界） */
export function datesFromPeriodDrop(period: SchedulePeriod): {
  startDate: string;
  endDate: string;
} {
  const today = toDateOnly(new Date());
  let day = today;
  if (today < period.from) day = toDateOnly(period.from);
  else if (today > period.to) day = toDateOnly(period.to);
  const key = formatLocalDateInput(day);
  return { startDate: key, endDate: key };
}

export function workdaysInPeriod(period: SchedulePeriod): number {
  return countCalendarDays(period.from, period.to);
}

export function countScheduledWorkdaysInPeriod(
  startDate: Date | string,
  endDate: Date | string,
  period: SchedulePeriod
): number {
  const start =
    typeof startDate === "string"
      ? toDateOnly(parseDateOnlyInput(startDate.slice(0, 10)))
      : toDateOnly(startDate);
  const end =
    typeof endDate === "string"
      ? toDateOnly(parseDateOnlyInput(endDate.slice(0, 10)))
      : toDateOnly(endDate);
  const from = maxDate(period.from, start);
  const to = minDate(period.to, end);
  if (from.getTime() > to.getTime()) return 0;
  return countCalendarDays(from, to);
}

export function formatPersonDays(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/** 甘特行副标题：本周期有效人天；与排班工作日不一致时补充说明 */
export function formatAllocationPersonDaysSummary(
  bars: Array<{ startDate: string; endDate: string; effectiveDays: number }>,
  period: SchedulePeriod
): string {
  const effective = Math.round(bars.reduce((sum, bar) => sum + bar.effectiveDays, 0) * 100) / 100;
  const scheduled = bars.reduce(
    (sum, bar) => sum + countScheduledWorkdaysInPeriod(bar.startDate, bar.endDate, period),
    0
  );
  const label = formatPersonDays(effective);
  if (scheduled > 0 && Math.abs(effective - scheduled) > 0.01) {
    return `本周期 ${label} 人天（排班 ${scheduled} 天）`;
  }
  return `本周期 ${label} 人天`;
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

/**
 * 资源明细下的项目筛选：空数组表示全部项目；否则为选中的项目 ID 列表（多选）。
 * URL 中用逗号拼接，缺省或 `all` 表示全部。
 */
export type ScheduleProjectIds = string[];

/** 资源明细排列维度：按项目 / 按人员 */
export type ScheduleDetailAxis = "project" | "person";

export function parseScheduleView(value: string | undefined): ScheduleModuleView {
  if (value === "detail" || value === "project") return "detail";
  return "global";
}

export function parseScheduleDetailAxis(value: string | undefined): ScheduleDetailAxis {
  if (value === "person" || value === "staff") return "person";
  return "project";
}

export function parseScheduleProjectIds(
  value: string | undefined,
  projectIds: string[]
): ScheduleProjectIds {
  if (!value?.trim() || value === "all") return [];
  const valid = new Set(projectIds);
  const ids: string[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (id && valid.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** @deprecated 使用 parseScheduleProjectIds */
export function parseScheduleProjectScope(
  value: string | undefined,
  projectIds: string[]
): "all" | string {
  const ids = parseScheduleProjectIds(value, projectIds);
  if (ids.length === 0) return "all";
  return ids[0];
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
  end?: string;
  view?: ScheduleModuleView;
  axis?: ScheduleDetailAxis;
  /** 空数组或不传表示全部；多个 ID 逗号拼接 */
  project?: ScheduleProjectIds | "all" | string | null;
  /** 逗号分隔的人员 ID；传空数组表示清除锁定 */
  lock?: string[] | null;
  /** 从项目计划任务弹窗跳来时带回，排班内跳转需透传 */
  returnTask?: string | null;
  /** @deprecated 使用 start + range=week */
  week?: string;
}): string {
  const sp = new URLSearchParams();
  const range = params.range ?? (params.week ? "week" : "month");
  sp.set("range", range);
  if (params.start) sp.set("start", params.start);
  else if (params.week) sp.set("start", params.week);
  if (range === "custom" && params.end) sp.set("end", params.end);
  if (params.view) sp.set("view", params.view);
  if (params.axis && params.axis !== "project") sp.set("axis", params.axis);

  if (params.project != null && params.project !== "all") {
    if (Array.isArray(params.project)) {
      if (params.project.length > 0) sp.set("project", params.project.join(","));
    } else if (params.project) {
      sp.set("project", params.project);
    }
  }

  if (params.lock !== undefined && params.lock !== null && params.lock.length > 0) {
    sp.set("lock", params.lock.join(","));
  }
  if (params.returnTask) {
    sp.set("returnTask", params.returnTask);
  }
  return `/projects/schedule?${sp.toString()}`;
}
