export const UPCOMING_WINDOW_OPTIONS = [
  { value: "7", days: 7, label: "7天" },
  { value: "15", days: 15, label: "15天" },
  { value: "30", days: 30, label: "30天" },
  { value: "all", days: null, label: "全部" },
] as const;

export type UpcomingWindowValue = (typeof UPCOMING_WINDOW_OPTIONS)[number]["value"];

export const DEFAULT_UPCOMING_WINDOW_VALUE: UpcomingWindowValue = "30";

export function parseUpcomingWindow(raw: string | undefined) {
  const value = raw ?? DEFAULT_UPCOMING_WINDOW_VALUE;
  const selected =
    UPCOMING_WINDOW_OPTIONS.find((opt) => opt.value === value) ??
    UPCOMING_WINDOW_OPTIONS.find((opt) => opt.value === DEFAULT_UPCOMING_WINDOW_VALUE)!;
  return {
    value: selected.value,
    withinDays: selected.days,
    label: selected.label,
  };
}
