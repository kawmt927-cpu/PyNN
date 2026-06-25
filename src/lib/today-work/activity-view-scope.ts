import { startOfDay, subDays } from "date-fns";
import { getCalendarWeekRange } from "@/lib/plans-tasks/upcoming-actions";

export type TeamActivityView = "day" | "week" | "history";

export function parseTeamActivityView(raw?: string): TeamActivityView {
  if (raw === "week" || raw === "history") return raw;
  return "day";
}

export function resolveTeamActivityUserId(
  raw: string | undefined,
  salesUserIds: string[]
): string | null {
  if (!raw || raw === "all") return null;
  return salesUserIds.includes(raw) ? raw : null;
}

export function getTeamActivityDateRange(
  view: TeamActivityView,
  now = new Date()
): { start: Date; end: Date } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (view === "day") {
    const start = startOfDay(now);
    return { start, end };
  }
  if (view === "week") {
    const { weekStart, weekEnd } = getCalendarWeekRange(now);
    return {
      start: weekStart,
      end: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() + 1),
    };
  }
  const start = startOfDay(subDays(now, 29));
  return { start, end };
}
