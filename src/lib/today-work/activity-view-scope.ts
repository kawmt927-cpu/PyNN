import { UserRole } from "@prisma/client";
import { startOfDay, subDays } from "date-fns";
import { getCalendarWeekRange } from "@/lib/plans-tasks/upcoming-actions";

export type TeamActivityView = "day" | "week" | "history";

/** 下拉「其他」：销售管理 + 管理员 */
export const TEAM_ACTIVITY_OTHER_FILTER = "other";

export type TeamActivityUserFilter = null | typeof TEAM_ACTIVITY_OTHER_FILTER | string;

export function parseTeamActivityView(raw?: string): TeamActivityView {
  if (raw === "week" || raw === "history") return raw;
  return "day";
}

export function resolveTeamActivityUserFilter(
  raw: string | undefined,
  allowedUserIds: string[]
): TeamActivityUserFilter {
  if (!raw || raw === "all") return null;
  if (raw === TEAM_ACTIVITY_OTHER_FILTER) return TEAM_ACTIVITY_OTHER_FILTER;
  return allowedUserIds.includes(raw) ? raw : null;
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

export const TEAM_ACTIVITY_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];
export const TEAM_ACTIVITY_OTHER_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];
