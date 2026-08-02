"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  PAYMENT_DUE_FILTERS,
  paymentCollectionAssignTitle,
  type PaymentDueFilterValue,
  type PaymentDueItem,
} from "@/lib/contracts/payment-due";
import { formatAmount } from "@/lib/opportunities/funnel";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { withReturnTo } from "@/lib/navigation/return-to";
import { CustomerNameLink } from "@/components/customers/customer-name-link";
import { CreateWeeklyAssignmentDialog } from "@/components/plans-tasks/create-weekly-assignment-dialog";
import { cn } from "@/lib/utils";
import { withPreservedMainScroll } from "@/lib/ui/preserve-main-scroll";

type SalesUser = { id: string; name: string };

type Props = {
  filter: PaymentDueFilterValue;
  items: PaymentDueItem[];
  byOwner: Array<{
    ownerId: string;
    ownerName: string;
    count: number;
    overdueCount: number;
  }>;
  returnPath: string;
  salesUsers: SalesUser[];
  baseSearchParams?: Record<string, string | undefined>;
  /** 已指派且未完成的催收回款任务标题 */
  assignedTitles?: string[];
};

function buildTodayWorkHref(
  returnPath: string,
  base: Record<string, string | undefined>,
  filter: PaymentDueFilterValue
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (!value || key === "paymentDue") continue;
    params.set(key, value);
  }
  if (filter !== "overdue") params.set("paymentDue", filter);
  const query = params.toString();
  const path = returnPath.split("?")[0] || "/today-work";
  return query ? `${path}?${query}` : path;
}

function collectionAssignDescription(row: PaymentDueItem) {
  return [
    `客户：${row.customerName}`,
    `计划到期 ${format(row.dueAt, "yyyy-MM-dd")}`,
    `待收 ${formatAmount(row.remainingAmount)}`,
    row.contractNo ? `合同编号 ${row.contractNo}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function PaymentDueTeamPanelClient({
  filter,
  items,
  byOwner,
  returnPath,
  salesUsers,
  baseSearchParams = {},
  assignedTitles = [],
}: Props) {
  const router = useRouter();
  const now = new Date();
  const filterMeta = PAYMENT_DUE_FILTERS.find((item) => item.value === filter);
  const isOverdueFilter = filter === "overdue";
  const assignedSet = new Set(assignedTitles);

  function selectFilter(next: PaymentDueFilterValue) {
    withPreservedMainScroll(() => {
      router.replace(buildTodayWorkHref(returnPath, baseSearchParams, next), {
        scroll: false,
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-2">
        {PAYMENT_DUE_FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => selectFilter(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {byOwner.length > 0 ? (
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byOwner.map((owner) => (
            <div key={owner.ownerId} className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{owner.ownerName}</p>
              <p className="mt-1 text-muted-foreground">
                {isOverdueFilter
                  ? `逾期 ${owner.count} 期`
                  : `${filterMeta?.label ?? ""} ${owner.count} 期`}
                {!isOverdueFilter && owner.overdueCount > 0
                  ? ` · 含逾期 ${owner.overdueCount}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <h3
          className={cn(
            "shrink-0 text-sm font-medium",
            isOverdueFilter
              ? "text-red-700 dark:text-red-400"
              : "text-amber-800 dark:text-amber-300"
          )}
        >
          {isOverdueFilter ? "逾期回款" : `${filterMeta?.label ?? ""}内待收`}
          <span className="ml-2 font-normal text-muted-foreground">({items.length})</span>
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前筛选下暂无回款计划。</p>
        ) : (
          <ul className="h-[calc(8*6.75rem)] space-y-2 overflow-y-auto pr-1">
            {items.map((row) => {
              const remaining = getRemainingTimeInfo(row.dueAt, now);
              const assignTitle = paymentCollectionAssignTitle(row);
              const alreadyAssigned = assignedSet.has(assignTitle);
              return (
                <li
                  key={row.installmentId}
                  className={cn(
                    "flex min-h-[6.25rem] flex-wrap items-start justify-between gap-2 rounded-md border p-3",
                    row.overdue
                      ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                      : "bg-card"
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.contractTitle}</p>
                      {alreadyAssigned ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                          已指派回款任务
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.ownerName} ·{" "}
                      <CustomerNameLink
                        customerId={row.customerId}
                        name={row.customerName}
                        returnTo={returnPath}
                        className="font-normal"
                      />{" "}
                      · 第 {row.periodNumber} 期 · 待收 {formatAmount(row.remainingAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      计划到期 {format(row.dueAt, "yyyy-MM-dd")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                      {remaining.label}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={withReturnTo(`/contracts/${row.contractId}`, returnPath)}>
                          查看合同
                        </Link>
                      </Button>
                      {alreadyAssigned ? (
                        <Button type="button" size="sm" variant="secondary" disabled>
                          已指派
                        </Button>
                      ) : (
                        <CreateWeeklyAssignmentDialog
                          salesUsers={salesUsers}
                          trigger={
                            <Button type="button" size="sm">
                              指派任务
                            </Button>
                          }
                          initialCustomerId={row.customerId}
                          initialCustomerLabel={row.customerName}
                          initialAssigneeId={row.ownerId}
                          initialTitle={assignTitle}
                          initialDescription={collectionAssignDescription(row)}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
