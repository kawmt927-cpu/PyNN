import { format } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyAssignmentForm } from "@/components/today-work/weekly-assignment-form";
import {
  listAllAssignmentsForManager,
  listAllAssignmentsForUser,
  weeklyAssignmentFollowUpHref,
  canManageWeeklyAssignments,
} from "@/lib/today-work/weekly-assignments";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { CancelWeeklyAssignmentButton } from "@/components/today-work/cancel-weekly-assignment-button";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待完成",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export async function AssignmentsTaskList({ role, userId, returnPath }: Props) {
  const canManage = canManageWeeklyAssignments(role);
  const now = new Date();

  if (canManage) {
    const [assignments, salesUsers] = await Promise.all([
      listAllAssignmentsForManager(),
      prisma.user.findMany({
        where: { role: { in: ["SALES", "SALES_MANAGER"] }, personnelProfile: { enabled: true } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>新建指派任务</CardTitle>
            <p className="text-sm text-muted-foreground">为销售指派需在截止前完成的跟进任务。</p>
          </CardHeader>
          <CardContent>
            <WeeklyAssignmentForm salesUsers={salesUsers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>全部任务（{assignments.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无任务。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">任务</th>
                      <th className="pb-2 pr-4">客户/商机</th>
                      <th className="pb-2 pr-4">销售</th>
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
                            {row.opportunity ? (
                              <Link href={`/opportunities/${row.opportunity.id}`} className="text-primary hover:underline">
                                {row.opportunity.title}
                              </Link>
                            ) : row.customer ? (
                              <Link href={`/customers/${row.customer.id}`} className="text-primary hover:underline">
                                {row.customer.name}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 pr-4">{row.assignee.name}</td>
                          <td className="whitespace-nowrap py-3 pr-4">{format(row.dueAt, "yyyy-MM-dd HH:mm")}</td>
                          <td className="py-3 pr-4">
                            {remaining ? (
                              <span className={remainingTimeClassName(remaining.tone)}>{remaining.label}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 pr-4">{STATUS_LABEL[row.status] ?? row.status}</td>
                          <td className="py-3">
                            {row.status === "PENDING" ? <CancelWeeklyAssignmentButton id={row.id} /> : null}
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
      </div>
    );
  }

  const tasks = await listAllAssignmentsForUser(userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>我的任务（{tasks.length}）</CardTitle>
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
                <li key={task.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{task.title}</p>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{STATUS_LABEL[task.status]}</span>
                    </div>
                    {task.description ? (
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {task.customer?.name ?? task.opportunity?.title ?? "—"} · 截止 {format(task.dueAt, "yyyy-MM-dd HH:mm")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {remaining ? (
                      <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>{remaining.label}</span>
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
