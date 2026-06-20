import { format } from "date-fns";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyAssignmentForm } from "@/components/today-work/weekly-assignment-form";
import { listWeeklyAssignmentsForManager } from "@/lib/today-work/weekly-assignments";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { CancelWeeklyAssignmentButton } from "@/components/today-work/cancel-weekly-assignment-button";

export default async function WeeklyTasksPage() {
  await requireRole(["SALES_MANAGER", "ADMIN"]);

  const [assignments, salesUsers] = await Promise.all([
    listWeeklyAssignmentsForManager(),
    prisma.user.findMany({
      where: { role: { in: ["SALES", "SALES_MANAGER"] }, personnelProfile: { enabled: true } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">每周任务</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          为销售指派本周内需跟进的客户或商机；销售在「今日工作」中查看剩余时间并直接跟进。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建任务</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyAssignmentForm salesUsers={salesUsers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>任务列表（{assignments.length}）</CardTitle>
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
                      row.status === "PENDING"
                        ? getRemainingTimeInfo(row.dueAt, now)
                        : null;
                    return (
                      <tr key={row.id} className="border-b">
                        <td className="py-3 pr-4 font-medium">{row.title}</td>
                        <td className="py-3 pr-4">
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
                        </td>
                        <td className="py-3 pr-4">{row.assignee.name}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">
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
                        <td className="py-3 pr-4">
                          {row.status === "PENDING"
                            ? "待完成"
                            : row.status === "COMPLETED"
                              ? "已完成"
                              : "已取消"}
                        </td>
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
    </div>
  );
}
