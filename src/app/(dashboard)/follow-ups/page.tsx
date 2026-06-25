import { getCustomerGradeLabelMap } from "@/lib/config-options";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpPendingTable } from "@/components/follow-ups/follow-up-pending-table";
import { UpcomingWindowFilter } from "@/components/follow-ups/upcoming-window-filter";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { parseUpcomingWindow } from "@/lib/follow-ups/upcoming-window";

type Props = {
  searchParams: Promise<{ window?: string }>;
};

export default async function FollowUpsPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const query = await searchParams;
  const now = new Date();
  const listPath = "/follow-ups";
  const upcomingWindow = parseUpcomingWindow(query.window);

  const [dueFollowUps, upcomingFollowUps, gradeLabels] = await Promise.all([
    getPendingFollowUps(session.user.role, session.user.id, "due", now, 500),
    getPendingFollowUps(session.user.role, session.user.id, "upcoming", now, 500, {
      withinDays: upcomingWindow.withinDays,
    }),
    getCustomerGradeLabelMap(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">待跟进</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-orange-600">
            已到期（{dueFollowUps.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dueFollowUps.length === 0 ? (
            <p className="text-muted-foreground">暂无到期跟进任务。</p>
          ) : (
            <FollowUpPendingTable
              items={dueFollowUps}
              listPath={listPath}
              gradeLabels={gradeLabels}
              now={now}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">
            即将到期（{upcomingFollowUps.length}）
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {upcomingWindow.label}内
            </span>
          </CardTitle>
          <UpcomingWindowFilter active={upcomingWindow.value} />
        </CardHeader>
        <CardContent>
          {upcomingFollowUps.length === 0 ? (
            <p className="text-muted-foreground">暂无计划中的跟进。</p>
          ) : (
            <FollowUpPendingTable
              items={upcomingFollowUps}
              listPath={listPath}
              gradeLabels={gradeLabels}
              now={now}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
