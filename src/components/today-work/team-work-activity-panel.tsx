import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTeamActivityDateRange,
  parseTeamActivityView,
  resolveTeamActivityUserId,
  type TeamActivityView,
} from "@/lib/today-work/activity-view-scope";
import { getCalendarWeekRange } from "@/lib/plans-tasks/upcoming-actions";
import {
  groupTeamWorkByDay,
  listTeamSalesMembers,
  listTeamWorkActivity,
  summarizeTeamWorkActivity,
} from "@/lib/today-work/team-work-activity";
import { TeamWorkActivityTabs, TeamSalesUserSelect } from "@/components/today-work/team-work-activity-tabs";
import {
  TeamWorkActivityFlatList,
  TeamWorkActivityGroupedList,
} from "@/components/today-work/team-work-activity-list";

type Props = {
  searchParams: { activityView?: string; salesUserId?: string };
};

function viewDescription(view: TeamActivityView, now: Date) {
  if (view === "day") return format(now, "yyyy年M月d日") + " · 全员今日打卡、往来与日报";
  if (view === "week") {
    const { weekStart, weekEnd } = getCalendarWeekRange(now);
    return `${format(weekStart, "M月d日")} – ${format(weekEnd, "M月d日")}（自然周）`;
  }
  return "近 30 天 · 按日汇总历史行为";
}

export async function TeamWorkActivityPanel({ searchParams }: Props) {
  const now = new Date();
  const view = parseTeamActivityView(searchParams.activityView);
  const salesUsers = await listTeamSalesMembers();
  const salesUserIds = salesUsers.map((u) => u.id);
  const selectedUserId = resolveTeamActivityUserId(searchParams.salesUserId, salesUserIds);
  const { start, end } = getTeamActivityDateRange(view, now);

  const items = await listTeamWorkActivity({
    start,
    end,
    userId: selectedUserId,
  });
  const summary = summarizeTeamWorkActivity(items);
  const groups = view === "day" ? [] : groupTeamWorkByDay(items);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">团队工作记录</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{viewDescription(view, now)}</p>
          </div>
          <TeamWorkActivityTabs view={view} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-2xl font-bold tabular-nums">{summary.checkIns}</p>
              <p className="text-xs text-muted-foreground">打卡</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{summary.followUps}</p>
              <p className="text-xs text-muted-foreground">往来</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{summary.logsSubmitted}</p>
              <p className="text-xs text-muted-foreground">已交日报</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{summary.salesActive}</p>
              <p className="text-xs text-muted-foreground">有记录销售</p>
            </div>
          </div>
          <TeamSalesUserSelect value={selectedUserId} salesUsers={salesUsers} />
        </div>
      </CardHeader>
      <CardContent>
        {view === "day" ? (
          <TeamWorkActivityFlatList items={items} />
        ) : (
          <TeamWorkActivityGroupedList groups={groups} />
        )}
      </CardContent>
    </Card>
  );
}
