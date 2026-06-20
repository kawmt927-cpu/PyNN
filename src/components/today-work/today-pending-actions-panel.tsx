import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import {
  getRemainingTimeInfo,
  remainingTimeClassName,
} from "@/lib/today-work/remaining-time";
import {
  listPendingWeeklyAssignmentsForUser,
  weeklyAssignmentFollowUpHref,
} from "@/lib/today-work/weekly-assignments";
import { withReturnTo } from "@/lib/navigation/return-to";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
};

export async function TodayPendingActionsPanel({ role, userId, returnPath }: Props) {
  const now = new Date();
  const [dueFollowUps, weeklyTasks] = await Promise.all([
    getPendingFollowUps(role, userId, "due", now, 15),
    listPendingWeeklyAssignmentsForUser(userId, 15),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg text-orange-600">待跟进（{dueFollowUps.length}）</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href={withReturnTo("/follow-ups", returnPath)}>全部</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {dueFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无到期跟进，继续保持。</p>
          ) : (
            <ul className="space-y-3">
              {dueFollowUps.map((item) => {
                const remaining = getRemainingTimeInfo(item.nextFollowUpAt, now);
                const href = item.opportunity
                  ? withReturnTo(`/opportunities/${item.opportunity.id}/follow-ups`, returnPath)
                  : withReturnTo(`/customers/${item.customer.id}/follow-ups`, returnPath);
                return (
                  <li
                    key={`${item.source}-${item.id}`}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.customer.name}</span>
                        <CustomerGradeIcon grade={item.customer.customerGrade} size="sm" />
                        {item.opportunity ? (
                          <span className="text-xs text-muted-foreground">
                            商机：{item.opportunity.title}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{item.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {FOLLOW_UP_METHOD_LABELS[item.method]} · 计划{" "}
                        {format(item.nextFollowUpAt, "MM-dd HH:mm")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                        {remaining.label}
                      </span>
                      <Button asChild size="sm">
                        <Link href={href}>去跟进</Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">每周任务（{weeklyTasks.length}）</CardTitle>
          <p className="text-sm text-muted-foreground">由销售管理员指派，请在截止前完成跟进。</p>
        </CardHeader>
        <CardContent>
          {weeklyTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">本周暂无指派任务。</p>
          ) : (
            <ul className="space-y-3">
              {weeklyTasks.map((task) => {
                const remaining = getRemainingTimeInfo(task.dueAt, now);
                const href = weeklyAssignmentFollowUpHref(task, returnPath);
                return (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{task.title}</p>
                      {task.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {task.customer?.name ?? task.opportunity?.title ?? "—"} · 截止{" "}
                        {format(task.dueAt, "MM-dd HH:mm")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                        {remaining.label}
                      </span>
                      {href ? (
                        <Button asChild size="sm">
                          <Link href={href}>去跟进</Link>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
