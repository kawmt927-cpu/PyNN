import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { getCustomerGradeLabelMap } from "@/lib/config-options";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { withReturnTo } from "@/lib/navigation/return-to";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
};

export async function TodayUpcomingList({ role, userId, returnPath }: Props) {
  const now = new Date();
  const { items, week } = await listUpcomingActionsThisWeek(role, userId, 30);
  const gradeLabels = await getCustomerGradeLabelMap();
  const weekLabel = `${format(week.weekStart, "M月d日")} – ${format(week.weekEnd, "M月d日")}`;
  const showOwner = canManageWeeklyAssignments(role);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-lg">本周待办</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {weekLabel}（周一至周日）· 含待跟进、指派任务与回款催收
            {showOwner ? " · 显示负责销售" : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={withReturnTo("/plans-tasks?tab=tasks", returnPath)}>计划与任务</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">本周暂无待办，继续保持。</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const remaining = getRemainingTimeInfo(item.dueAt, now);
              const href =
                item.kind === "payment_collection"
                  ? withReturnTo(`/contracts/${item.contractId}`, returnPath)
                  : item.kind === "assignment"
                  ? item.opportunityId
                    ? withReturnTo(`/opportunities/${item.opportunityId}/follow-ups`, returnPath)
                    : item.customerId
                      ? withReturnTo(`/customers/${item.customerId}/follow-ups`, returnPath)
                      : null
                  : item.opportunityId
                    ? withReturnTo(`/opportunities/${item.opportunityId}/follow-ups`, returnPath)
                    : withReturnTo(`/customers/${item.customerId}/follow-ups`, returnPath);

              return (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          item.kind === "payment_collection"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : item.kind === "assignment"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200"
                            : "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
                        }`}
                      >
                        {item.kind === "payment_collection"
                          ? "回款催收"
                          : item.kind === "assignment"
                            ? "指派"
                            : "待跟进"}
                      </span>
                      <span className="font-medium">{item.title}</span>
                      {item.kind === "follow_up" ? (
                        <CustomerGradeIcon grade={item.customerGrade} size="sm" labelMap={gradeLabels} />
                      ) : null}
                    </div>
                    {item.subtitle ? (
                      <p className="text-sm text-muted-foreground line-clamp-1">{item.subtitle}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {showOwner ? (
                        <>
                          <span className="font-medium text-foreground">{item.owner.name}</span>
                          {" · "}
                        </>
                      ) : null}
                      计划{" "}
                      {format(item.dueAt, item.kind === "payment_collection" ? "MM-dd" : "MM-dd HH:mm")}
                      {item.overdue ? " · 已到期" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                      {remaining.label}
                    </span>
                    {href ? (
                      <Button asChild size="sm">
                        <Link href={href}>
                          {item.kind === "payment_collection" ? "去催收" : "去处理"}
                        </Link>
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
  );
}
