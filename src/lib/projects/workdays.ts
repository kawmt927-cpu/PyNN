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

export function eachWorkday(start: Date, end: Date): Date[] {
  const from = toDateOnly(start);
  const to = toDateOnly(end);
  if (compareDates(from, to) > 0) return [];

  const days: Date[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    if (isWorkday(cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function countWorkdays(start: Date, end: Date): number {
  return eachWorkday(start, end).length;
}
