import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTeamActivityDateRange,
  parseTeamActivityView,
  resolveTeamActivityUserFilter,
  type TeamActivityView,
} from "@/lib/today-work/activity-view-scope";
import { getCalendarWeekRange } from "@/lib/plans-tasks/upcoming-actions";
import {
  groupTeamWorkByDay,
  listTeamActivityMembers,
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
  const allMembers = await listTeamActivityMembers();
  const salesUsers = allMembers
    .filter((u) => u.role === "SALES")
    .map(({ id, name }) => ({ id, name }));
  const allowedIds = allMembers.map((u) => u.id);
  const filter = resolveTeamActivityUserFilter(searchParams.salesUserId, allowedIds);
  const { start, end } = getTeamActivityDateRange(view, now);

  const items = await listTeamWorkActivity({
    start,
    end,
    filter,
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="flex flex-wrap items-end justify-center gap-10 sm:gap-14">
              {(
                [
                  { value: summary.checkIns, label: "打卡" },
                  { value: summary.followUps, label: "往来" },
                  { value: summary.logsSubmitted, label: "已交日报" },
                ] as const
              ).map((stat) => (
                <div key={stat.label} className="flex min-w-[4rem] flex-col items-center gap-1.5 text-center">
                  <p className="text-4xl font-bold leading-none tabular-nums tracking-tight">
                    {stat.value}
                  </p>
                  <p className="text-sm leading-none text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
          <TeamSalesUserSelect value={filter} salesUsers={salesUsers} />
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
