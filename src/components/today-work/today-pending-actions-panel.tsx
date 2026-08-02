import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { getCustomerGradeLabelMap } from "@/lib/config-options";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import {
  getRemainingTimeInfo,
  remainingTimeClassName,
} from "@/lib/today-work/remaining-time";
import {
  assignmentKindLabel,
  assignmentStatusLabel,
  listPendingWeeklyAssignmentsForUser,
  weeklyAssignmentFollowUpHref,
} from "@/lib/today-work/weekly-assignments";
import { withReturnTo } from "@/lib/navigation/return-to";
import { CustomerNameLink } from "@/components/customers/customer-name-link";
import { GeneralAssignmentActionButton } from "@/components/today-work/general-assignment-action-button";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
};

export async function TodayPendingActionsPanel({ role, userId, returnPath }: Props) {
  const now = new Date();
  const [dueFollowUps, weeklyTasks, gradeLabels] = await Promise.all([
    getPendingFollowUps(role, userId, "due", now, 15),
    listPendingWeeklyAssignmentsForUser(userId, 15),
    getCustomerGradeLabelMap(),
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
                        <CustomerNameLink
                          customerId={item.customer.id}
                          name={item.customer.name}
                          returnTo={returnPath}
                        />
                        <CustomerGradeIcon
                          grade={item.customer.customerGrade}
                          size="sm"
                          labelMap={gradeLabels}
                        />
                        {item.opportunity ? (
                          <span className="text-xs text-muted-foreground">
                            商机：{item.opportunity.title}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{item.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.method ? FOLLOW_UP_METHOD_LABELS[item.method] : "等级到期"}
                        {item.source === "grade_expiry" ? "" : " · 计划 "}
                        {item.source !== "grade_expiry"
                          ? format(item.nextFollowUpAt, "MM-dd HH:mm")
                          : `截止 ${format(item.nextFollowUpAt, "MM-dd")}`}
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
          <CardTitle className="text-lg">指派任务（{weeklyTasks.length}）</CardTitle>
          <p className="text-sm text-muted-foreground">
            含客户跟进与普通任务；普通任务完成后需指派人确认。
          </p>
        </CardHeader>
        <CardContent>
          {weeklyTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无未完成的指派任务。</p>
          ) : (
            <ul className="space-y-3">
              {weeklyTasks.map((task) => {
                const remaining = getRemainingTimeInfo(task.dueAt, now);
                const href = weeklyAssignmentFollowUpHref(task, returnPath);
                const canMarkDone =
                  task.kind === "GENERAL" &&
                  task.status === "PENDING" &&
                  task.assigneeId === userId;
                const canConfirm =
                  task.kind === "GENERAL" &&
                  task.status === "PENDING_CONFIRM" &&
                  task.createdById === userId;
                return (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {task.kind === "GENERAL" ? (
                          task.title
                        ) : task.customer ? (
                          <CustomerNameLink
                            customerId={task.customer.id}
                            name={task.customer.name}
                            returnTo={returnPath}
                          />
                        ) : (
                          task.opportunity?.title ?? "—"
                        )}
                      </p>
                      {task.kind === "GENERAL" ? null : (
                        <p className="text-sm text-muted-foreground">{task.title}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {assignmentKindLabel(task.kind)}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {assignmentStatusLabel(task.status)}
                        </span>
                      </div>
                      {task.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {task.createdBy.name} 指派给 {task.assignee.name} · 截止{" "}
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
                      {canMarkDone ? (
                        <GeneralAssignmentActionButton assignmentId={task.id} mode="mark_done" />
                      ) : null}
                      {canConfirm ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <GeneralAssignmentActionButton assignmentId={task.id} mode="confirm" />
                          <GeneralAssignmentActionButton assignmentId={task.id} mode="reject" />
                        </div>
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
