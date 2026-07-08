import { toDateOnly } from "./workdays";

export function getWeekRange(reference = new Date()): { from: Date; to: Date } {
  const date = toDateOnly(reference);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const from = new Date(date);
  from.setDate(from.getDate() + diffToMonday);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}
