export const PLANNED_FOLLOW_UP_QUICK_DAYS = [3, 7, 15, 30] as const;
export const PLANNED_FOLLOW_UP_DEFAULT_TIME = "09:00";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatLocalDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatLocalTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addLocalDays(days: number, from = new Date()): string {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return formatLocalDateInput(next);
}

export function joinPlannedFollowUpValue(date: string, time = PLANNED_FOLLOW_UP_DEFAULT_TIME): string {
  if (!date.trim()) return "";
  return `${date}T${time || PLANNED_FOLLOW_UP_DEFAULT_TIME}`;
}

export function addLocalDaysWithDefaultTime(days: number, from = new Date()): string {
  return joinPlannedFollowUpValue(addLocalDays(days), PLANNED_FOLLOW_UP_DEFAULT_TIME);
}

export function splitPlannedFollowUpValue(value: string): { date: string; time: string } {
  if (!value.trim()) {
    return { date: "", time: PLANNED_FOLLOW_UP_DEFAULT_TIME };
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return {
      date: trimmed.slice(0, 10),
      time: trimmed.slice(11, 16),
    };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { date: trimmed, time: PLANNED_FOLLOW_UP_DEFAULT_TIME };
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      date: formatLocalDateInput(parsed),
      time: formatLocalTimeInput(parsed),
    };
  }

  return { date: "", time: PLANNED_FOLLOW_UP_DEFAULT_TIME };
}

/** 将日期/时间输入或历史值转为 datetime-local 字符串 */
export function toPlannedFollowUpInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : joinPlannedFollowUpValue(formatLocalDateInput(value), formatLocalTimeInput(value));
  }
  const { date, time } = splitPlannedFollowUpValue(value);
  return date ? joinPlannedFollowUpValue(date, time) : "";
}

/** @deprecated 使用 toPlannedFollowUpInputValue */
export function toLocalDateInputValue(value: string | Date | null | undefined): string {
  return toPlannedFollowUpInputValue(value);
}

/** 计划跟进时间：解析 datetime-local 或纯日期（默认 9:00） */
export function parsePlannedFollowUpDateInput(value: string | null | undefined): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const [datePart, timePart] = trimmed.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm] = timePart.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    return new Date(y, m - 1, d, 9, 0, 0, 0);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
