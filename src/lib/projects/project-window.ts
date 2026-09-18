import { compareDates, toDateOnly } from "@/lib/projects/workdays";
import { formatLocalDateInput } from "@/lib/dates/local-date";

/** 阶段是否超出项目计划窗口（开始更早或结束更晚） */
export function phaseExceedsProjectWindow(input: {
  projectStart: Date | string | null | undefined;
  projectEnd: Date | string | null | undefined;
  phaseStart: Date | string | null | undefined;
  phaseEnd: Date | string | null | undefined;
}): boolean {
  const pStart = asDateOnly(input.projectStart);
  const pEnd = asDateOnly(input.projectEnd);
  const s = asDateOnly(input.phaseStart);
  const e = asDateOnly(input.phaseEnd);
  if (!pStart || !pEnd || !s || !e) return false;
  return compareDates(s, pStart) < 0 || compareDates(e, pEnd) > 0;
}

/**
 * 将项目计划窗口延长到覆盖阶段起止（只延长不缩短）。
 * 返回 null 表示无需变更。
 */
export function computeExtendedProjectWindow(input: {
  projectStart: Date | string | null | undefined;
  projectEnd: Date | string | null | undefined;
  phaseStart: Date | string | null | undefined;
  phaseEnd: Date | string | null | undefined;
}): { plannedStartAt: Date; plannedEndAt: Date } | null {
  const pStart = asDateOnly(input.projectStart);
  const pEnd = asDateOnly(input.projectEnd);
  const s = asDateOnly(input.phaseStart);
  const e = asDateOnly(input.phaseEnd);
  if (!pStart || !pEnd || !s || !e) return null;

  let nextStart = pStart;
  let nextEnd = pEnd;
  let changed = false;
  if (compareDates(s, nextStart) < 0) {
    nextStart = s;
    changed = true;
  }
  if (compareDates(e, nextEnd) > 0) {
    nextEnd = e;
    changed = true;
  }
  if (!changed) return null;
  return { plannedStartAt: nextStart, plannedEndAt: nextEnd };
}

export function formatProjectWindowExtendMessage(input: {
  projectStart: string;
  projectEnd: string;
  nextStart: string;
  nextEnd: string;
}): string {
  return `阶段时间超出当前项目计划（${input.projectStart} ~ ${input.projectEnd}）。是否将项目计划延长为 ${input.nextStart} ~ ${input.nextEnd}，并与该阶段保持同步？`;
}

function asDateOnly(value: Date | string | null | undefined): Date | null {
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

export function toProjectWindowDateKey(value: Date): string {
  return formatLocalDateInput(value);
}
