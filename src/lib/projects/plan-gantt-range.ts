import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { toDateOnly } from "@/lib/projects/workdays";
import {
  SCHEDULE_CUSTOM_MAX_DAYS,
  SCHEDULE_DAY_WIDTH_MIN,
  SCHEDULE_MODULE_DAY_WIDTH,
  SCHEDULE_MODULE_MONTH_DAY_WIDTH,
  getCustomPeriod,
  getMonthRange,
  getWeekPeriod,
  type TimelineDay,
} from "@/lib/projects/timeline";

export type PlanGanttRangeMode = "day" | "week" | "month" | "custom";

export type PlanGanttPeriod = {
  mode: PlanGanttRangeMode;
  from: Date;
  to: Date;
};

const DAY_VIEW_WIDTH = 36;
const WEEK_VIEW_WIDTH = 18;

export function planGanttDayWidth(mode: PlanGanttRangeMode, totalDays: number): number {
  if (mode === "day") return DAY_VIEW_WIDTH;
  if (mode === "week") return WEEK_VIEW_WIDTH;
  if (mode === "month") return SCHEDULE_MODULE_MONTH_DAY_WIDTH;
  // custom：长跨度时压缩列宽
  if (totalDays > 180) return Math.max(SCHEDULE_DAY_WIDTH_MIN, Math.floor(1200 / totalDays));
  return SCHEDULE_MODULE_DAY_WIDTH;
}

export function resolvePlanGanttPeriod(input: {
  mode: PlanGanttRangeMode;
  projectStart: Date | null;
  projectEnd: Date | null;
  customStart?: string | null;
  customEnd?: string | null;
  anchor?: Date;
}): PlanGanttPeriod | null {
  const anchor = input.anchor ? toDateOnly(input.anchor) : toDateOnly(new Date());
  if (input.mode === "week") {
    const period = getWeekPeriod(anchor);
    return { mode: "week", from: period.from, to: period.to };
  }
  if (input.mode === "month") {
    const period = getMonthRange(anchor);
    return { mode: "month", from: period.from, to: period.to };
  }
  if (input.mode === "custom") {
    if (input.customStart && input.customEnd) {
      const from = toDateOnly(new Date(input.customStart.slice(0, 10)));
      const to = toDateOnly(new Date(input.customEnd.slice(0, 10)));
      const period = getCustomPeriod(from, to);
      return { mode: "custom", from: period.from, to: period.to };
    }
    if (input.projectStart && input.projectEnd) {
      const period = getCustomPeriod(input.projectStart, input.projectEnd);
      return { mode: "custom", from: period.from, to: period.to };
    }
    return null;
  }
  // day：默认覆盖项目整段；无项目日期则近 30 天
  if (input.projectStart && input.projectEnd) {
    const from = toDateOnly(input.projectStart);
    const to = toDateOnly(input.projectEnd);
    const days = differenceInCalendarDays(to, from) + 1;
    if (days > SCHEDULE_CUSTOM_MAX_DAYS) {
      return {
        mode: "day",
        from: addDays(to, -(SCHEDULE_CUSTOM_MAX_DAYS - 1)),
        to,
      };
    }
    return { mode: "day", from, to };
  }
  return { mode: "day", from: anchor, to: addDays(anchor, 29) };
}

export function buildPlanGanttDays(from: Date, to: Date): TimelineDay[] {
  return eachDayOfInterval({ start: from, end: to }).map((date) => ({
    date,
    dateKey: formatLocalDateInput(date),
    label: format(date, "d"),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
  }));
}

export type PlanGanttHeaderBand = {
  key: string;
  label: string;
  dayCount: number;
};

export function buildPlanGanttHeaderBands(
  days: TimelineDay[],
  mode: PlanGanttRangeMode
): PlanGanttHeaderBand[] {
  if (days.length === 0) return [];
  if (mode === "week") {
    const bands: PlanGanttHeaderBand[] = [];
    let i = 0;
    while (i < days.length) {
      const start = days[i].date;
      const weekEnd = endOfWeek(start, { weekStartsOn: 1 });
      let count = 0;
      while (i + count < days.length && days[i + count].date <= weekEnd) count += 1;
      bands.push({
        key: formatLocalDateInput(start),
        label: `${format(start, "M/d", { locale: zhCN })} 周`,
        dayCount: count,
      });
      i += count;
    }
    return bands;
  }
  // day / month / custom：按月分带
  const bands: PlanGanttHeaderBand[] = [];
  let i = 0;
  while (i < days.length) {
    const start = days[i].date;
    const monthEnd = endOfMonth(start);
    let count = 0;
    while (i + count < days.length && days[i + count].date <= monthEnd) count += 1;
    bands.push({
      key: format(start, "yyyy-MM"),
      label: format(start, "yyyy年M月", { locale: zhCN }),
      dayCount: count,
    });
    i += count;
  }
  return bands;
}

/** 阶段甘特条：有子任务时取子任务最小开始～最大结束，否则用阶段自身计划日期 */
export function resolvePhaseGanttBarRange(input: {
  plannedStartAt?: Date | string | null;
  plannedEndAt?: Date | string | null;
  tasks: Array<{
    plannedStartAt: Date | string;
    plannedEndAt: Date | string;
  }>;
}): { start: Date; end: Date } | null {
  if (input.tasks.length > 0) {
    let start: Date | null = null;
    let end: Date | null = null;
    for (const task of input.tasks) {
      const s = asFocusDate(task.plannedStartAt);
      const e = asFocusDate(task.plannedEndAt);
      if (s && (!start || s.getTime() < start.getTime())) start = s;
      if (e && (!end || e.getTime() > end.getTime())) end = e;
    }
    if (start && end) {
      if (end.getTime() < start.getTime()) return { start, end: start };
      return { start, end };
    }
  }
  const phaseStart = asFocusDate(input.plannedStartAt);
  const phaseEnd = asFocusDate(input.plannedEndAt);
  if (phaseStart && phaseEnd) {
    if (phaseEnd.getTime() < phaseStart.getTime()) {
      return { start: phaseStart, end: phaseStart };
    }
    return { start: phaseStart, end: phaseEnd };
  }
  return null;
}

export function shiftPlanGanttAnchor(
  mode: PlanGanttRangeMode,
  anchor: Date,
  direction: -1 | 1
): Date {
  const day = toDateOnly(anchor);
  if (mode === "week") return addDays(startOfWeek(day, { weekStartsOn: 1 }), direction * 7);
  if (mode === "month") {
    const base = startOfMonth(day);
    return addDays(direction > 0 ? endOfMonth(base) : addDays(base, -1), direction > 0 ? 1 : 0);
  }
  return addDays(day, direction * 14);
}

/**
 * 日/周/月切换时的定位锚点：优先最新资源投入结束日，
 * 否则取任务最晚计划结束 → 项目计划结束 → 计划开始 → 今天。
 */
export function resolvePlanGanttFocusAnchor(input: {
  allocationSpanEnd?: Date | string | null;
  taskEnds?: Array<Date | string | null | undefined>;
  plannedEnd?: Date | string | null;
  plannedStart?: Date | string | null;
}): Date {
  const allocEnd = asFocusDate(input.allocationSpanEnd);
  if (allocEnd) return allocEnd;

  let latestTask: Date | null = null;
  for (const raw of input.taskEnds ?? []) {
    const d = asFocusDate(raw);
    if (!d) continue;
    if (!latestTask || d.getTime() > latestTask.getTime()) latestTask = d;
  }
  if (latestTask) return latestTask;

  const plannedEnd = asFocusDate(input.plannedEnd);
  if (plannedEnd) return plannedEnd;

  const plannedStart = asFocusDate(input.plannedStart);
  if (plannedStart) return plannedStart;

  return toDateOnly(new Date());
}

function asFocusDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toDateOnly(value);
  }
  const key = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return toDateOnly(new Date(y, m - 1, d));
}

export { SCHEDULE_CUSTOM_MAX_DAYS };
