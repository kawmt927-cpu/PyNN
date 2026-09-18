import { endOfMonth, startOfMonth } from "date-fns";
import {
  ensureCompanyCalendarCache,
  isDailyReportRequiredDay,
  toDayKeyLocal,
} from "@/lib/calendar/cn-daily-report-days";
import { eachCalendarDay, toDateOnly } from "@/lib/projects/workdays";

/** 某月内所有「公司出勤日」的 dayKey（法定假/调休已计入） */
export async function listCompanyAttendanceDayKeys(
  year: number,
  month: number
): Promise<string[]> {
  await ensureCompanyCalendarCache();
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  return eachCalendarDay(start, end)
    .filter((d) => isDailyReportRequiredDay(d))
    .map((d) => toDayKeyLocal(d));
}

export async function countCompanyAttendanceDays(
  year: number,
  month: number
): Promise<number> {
  const keys = await listCompanyAttendanceDayKeys(year, month);
  return keys.length;
}

export function parseDayKeyLocal(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return toDateOnly(new Date(y, m - 1, d));
}

export function eachDayKeyInclusive(startDayKey: string, endDayKey: string): string[] {
  const start = parseDayKeyLocal(startDayKey);
  const end = parseDayKeyLocal(endDayKey);
  if (start.getTime() > end.getTime()) return [];
  return eachCalendarDay(start, end).map((d) => toDayKeyLocal(d));
}
