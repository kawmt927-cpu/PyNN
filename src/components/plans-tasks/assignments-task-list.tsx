import { format } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWeeklyAssignmentDialog } from "@/components/plans-tasks/create-weekly-assignment-dialog";
import {
  listAllAssignmentsForManager,
  listAllAssignmentsForUser,
  weeklyAssignmentFollowUpHref,
  canManageWeeklyAssignments,
} from "@/lib/today-work/weekly-assignments";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { CancelWeeklyAssignmentButton } from "@/components/today-work/cancel-weekly-assignment-button";
import type { UserRole } from "@prisma/client";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
};

function taskEntityLabel(task: {
  customer: { name: string } | null;
  opportunity: { title: string } | null;
}) {
  return task.customer?.name ?? task.opportunity?.title ?? "—";
}

function taskSecondaryMeta(task: {
  dueAt: Date;
  followUp?: {
    nextFollowUpMethod: string | null;
    contact: { name: string } | null;
  } | null;
}) {
  const parts = taskMetaParts(task);
  parts.push(`截止 ${format(task.dueAt, "yyyy-MM-dd HH:mm")}`);
  return parts.join(" · ");
}
function taskMetaParts(row: {
  followUp?: {
    nextFollowUpMethod: string | null;
    contact: { name: string } | null;
  } | null;
}) {
  const parts: string[] = [];
  if (row.followUp?.contact?.name) parts.push(row.followUp.contact.name);
  if (row.followUp?.nextFollowUpMethod) {
    parts.push(
      FOLLOW_UP_METHOD_LABELS[
        row.followUp.nextFollowUpMethod as keyof typeof FOLLOW_UP_METHOD_LABELS
      ] ?? row.followUp.nextFollowUpMethod
    );
  }
  return parts;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待完成",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

function assignmentProgressTitle(label: string, items: Array<{ status: string }>) {
  const total = items.length;
  const completed = items.filter((item) => item.status === "COMPLETED").length;
  return `${label}（${completed}/${total}）`;
}

export async function AssignmentsTaskList({ role, userId, returnPath }: Props) {
  const canManage = canManageWeeklyAssignments(role);
  const now = new Date();

  if (canManage) {
    const assignments = await listAllAssignmentsForManager();

    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{assignmentProgressTitle("全部任务", assignments)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              管理员指派的全部任务，按截止时间排序。
            </p>
          </div>
          <CreateWeeklyAssignmentDialog />
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无任务。可点击「新建指派任务」创建。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">任务</th>
                    <th className="pb-2 pr-4">客户/商机</th>
                    <th className="pb-2 pr-4">指派给</th>
                    <th className="pb-2 pr-4">截止</th>
                    <th className="pb-2 pr-4">剩余</th>
                    <th className="pb-2 pr-4">状态</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((row) => {
                    const remaining =
                      row.status === "PENDING" ? getRemainingTimeInfo(row.dueAt, now) : null;
                    return (
                      <tr key={row.id} className="border-b">
                        <td className="py-3 pr-4 font-medium">{row.title}</td>
                        <td className="py-3 pr-4">
                          <div>
                            {row.opportunity ? (
                              <Link
                                href={`/opportunities/${row.opportunity.id}`}
                                className="text-primary hover:underline"
                              >
                                {row.opportunity.title}
                              </Link>
                            ) : row.customer ? (
                              <Link
                                href={`/customers/${row.customer.id}`}
                                className="text-primary hover:underline"
                              >
                                {row.customer.name}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </div>
                          {taskMetaParts(row).length > 0 ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {taskMetaParts(row).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">
                          <div>{row.assignee.name}</div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            由 {row.createdBy.name} 指派
                          </p>
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4">
                          {format(row.dueAt, "yyyy-MM-dd HH:mm")}
                        </td>
                        <td className="py-3 pr-4">
                          {remaining ? (
                            <span className={remainingTimeClassName(remaining.tone)}>
                              {remaining.label}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 pr-4">{STATUS_LABEL[row.status] ?? row.status}</td>
                        <td className="py-3">
                          {row.status === "PENDING" ? (
                            <CancelWeeklyAssignmentButton id={row.id} />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const tasks = await listAllAssignmentsForUser(userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{assignmentProgressTitle("我的任务", tasks)}</CardTitle>
        <p className="text-sm text-muted-foreground">管理员指派的全部任务，按截止时间倒序。</p>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无指派任务。</p>
        ) : (
          <ul className="space-y-3">
            {tasks.map((task) => {
              const remaining = task.status === "PENDING" ? getRemainingTimeInfo(task.dueAt, now) : null;
              const href = task.status === "PENDING" ? weeklyAssignmentFollowUpHref(task, returnPath) : null;
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{taskEntityLabel(task)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted-foreground">{task.title}</p>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {STATUS_LABEL[task.status]}
                      </span>
                    </div>
                    {task.description ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{taskSecondaryMeta(task)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {remaining ? (
                      <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                        {remaining.label}
                      </span>
                    ) : null}
                    {href ? (
                      <Link href={href} className="text-sm font-medium text-primary hover:underline">
                        去跟进
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
