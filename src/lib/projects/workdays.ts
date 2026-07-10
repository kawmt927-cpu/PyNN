export function toDateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function compareDates(a: Date, b: Date): number {
  return toDateOnly(a).getTime() - toDateOnly(b).getTime();
}

export function maxDate(a: Date, b: Date): Date {
  return compareDates(a, b) >= 0 ? toDateOnly(a) : toDateOnly(b);
}

export function minDate(a: Date, b: Date): Date {
  return compareDates(a, b) <= 0 ? toDateOnly(a) : toDateOnly(b);
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = toDateOnly(date).getTime();
  return d >= toDateOnly(start).getTime() && d <= toDateOnly(end).getTime();
}

/** 排班区间内的全部日历日（含周末），用于人天拆分与合计 */
export function eachCalendarDay(start: Date, end: Date): Date[] {
  const from = toDateOnly(start);
  const to = toDateOnly(end);
  if (compareDates(from, to) > 0) return [];

  const days: Date[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function countCalendarDays(start: Date, end: Date): number {
  return eachCalendarDay(start, end).length;
}

/** 仅周一至周五（拖拽默认区间、容量口径等仍可用） */
export function eachWorkday(start: Date, end: Date): Date[] {
  return eachCalendarDay(start, end).filter(isWorkday);
}

export function countWorkdays(start: Date, end: Date): number {
  return eachWorkday(start, end).length;
}
