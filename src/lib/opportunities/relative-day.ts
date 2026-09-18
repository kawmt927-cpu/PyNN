import { differenceInCalendarDays, format } from "date-fns";

/** 列表用：相对今天显示「X 天前 / 今天 / X 天后」 */
export function formatRelativeDayLabel(value: Date, now = new Date()) {
  const days = differenceInCalendarDays(value, now);
  if (days === 0) return "今天";
  if (days > 0) return `${days} 天后`;
  return `${Math.abs(days)} 天前`;
}

export function formatAbsoluteDate(value: Date) {
  return format(value, "yyyy-MM-dd");
}
