import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listTeamPaymentDueOverview } from "@/lib/contracts/payment-due";
import { formatAmount } from "@/lib/opportunities/funnel";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { withReturnTo } from "@/lib/navigation/return-to";
import { canManageContractApproval } from "@/lib/contracts/access";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  returnPath: string;
};

export async function PaymentDueTeamPanel({ role, returnPath }: Props) {
  if (!canManageContractApproval(role)) return null;

  const now = new Date();
  const { overdue, dueSoon, byOwner } = await listTeamPaymentDueOverview(now, 30);

  if (overdue.length === 0 && dueSoon.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">团队回款催收</CardTitle>
          <p className="text-sm text-muted-foreground">全员已签署合同的分期回款计划监控</p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">当前无逾期或即将到期的回款计划。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg">团队回款催收</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            逾期 {overdue.length} 笔 · 7 日内待收 {dueSoon.length} 笔（按瀑布进度判断未结清期次）
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={withReturnTo("/contracts", returnPath)}>合同列表</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {byOwner.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byOwner.map((owner) => (
              <div key={owner.ownerId} className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{owner.ownerName}</p>
                <p className="mt-1 text-muted-foreground">
                  逾期 {owner.overdue.length} 期
                  {owner.dueSoon.length > 0 ? ` · 待收 ${owner.dueSoon.length} 期` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-red-700 dark:text-red-400">逾期优先</h3>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无逾期回款。</p>
          ) : (
            <ul className="space-y-2">
              {overdue.slice(0, 15).map((row) => {
                const remaining = getRemainingTimeInfo(row.dueAt, now);
                return (
                  <li
                    key={row.installmentId}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{row.contractTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.ownerName} · {row.customerName} · 第 {row.periodNumber} 期 · 待收{" "}
                        {formatAmount(row.remainingAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        计划到期 {format(row.dueAt, "yyyy-MM-dd")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                        {remaining.label}
                      </span>
                      <Button asChild size="sm">
                        <Link href={withReturnTo(`/contracts/${row.contractId}`, returnPath)}>
                          查看合同
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {dueSoon.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">7 日内待收</h3>
            <ul className="space-y-2">
              {dueSoon.slice(0, 10).map((row) => {
                const remaining = getRemainingTimeInfo(row.dueAt, now);
                return (
                  <li
                    key={row.installmentId}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{row.contractTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.ownerName} · 第 {row.periodNumber} 期 · {formatAmount(row.remainingAmount)}
                      </p>
                    </div>
                    <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                      {remaining.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
