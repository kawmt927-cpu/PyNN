"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  PAYMENT_DUE_FILTERS,
  paymentCollectionAssignTitle,
  paymentCollectionAssignTitlesForItem,
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
import { ScrollChain, ScrollChainList } from "@/components/ui/scroll-chain";

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
  windowCounts: Record<"30" | "90" | "180", number>;
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
  const periodLabel =
    row.periodNumbers.length > 1
      ? `第 ${row.periodNumbers.join("、")} 期`
      : `第 ${row.periodNumber} 期`;
  return [
    `客户：${row.customerName}`,
    `计划到期 ${format(row.dueAt, "yyyy-MM-dd")}`,
    `${periodLabel} · 待收 ${formatAmount(row.remainingAmount)}`,
    row.contractNo ? `合同编号 ${row.contractNo}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function periodLabel(row: PaymentDueItem) {
  if (row.periodNumbers.length <= 1) return `第 ${row.periodNumber} 期`;
  return `第 ${row.periodNumbers.join("、")} 期（${row.periodNumbers.length} 期）`;
}

export function PaymentDueTeamPanelClient({
  filter,
  items,
  byOwner,
  windowCounts,
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
          const isOverdueTab = option.value === "overdue";
          const badgeCount =
            option.value === "30" || option.value === "90" || option.value === "180"
              ? windowCounts[option.value]
              : 0;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => selectFilter(option.value)}
              className={cn(
                "relative rounded-full border px-3 py-1.5 text-sm transition-colors",
                isOverdueTab
                  ? active
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200 dark:hover:bg-orange-950/70"
                  : active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {option.label}
              {!isOverdueTab && badgeCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 固定高度：切换标签时不撑高/缩短整页，内部自行滚动 */}
      <div className="flex h-[34rem] flex-col gap-3">
        <ScrollChain className="grid max-h-[7.5rem] shrink-0 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {byOwner.length > 0 ? (
            byOwner.map((owner) => (
              <div key={owner.ownerId} className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{owner.ownerName}</p>
                <p className="mt-1 text-muted-foreground">
                  {isOverdueFilter
                    ? `逾期 ${owner.count} 份合同`
                    : `${filterMeta?.label ?? ""} ${owner.count} 期`}
                  {!isOverdueFilter && owner.overdueCount > 0
                    ? ` · 含逾期 ${owner.overdueCount}`
                    : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="col-span-full text-sm text-muted-foreground">当前筛选下暂无负责人汇总。</p>
          )}
        </ScrollChain>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <h3
            className={cn(
              "shrink-0 text-sm font-medium",
              isOverdueFilter
                ? "text-orange-700 dark:text-orange-400"
                : "text-primary"
            )}
          >
            {isOverdueFilter ? "逾期回款" : `${filterMeta?.label ?? ""}内待收`}
            <span className="ml-2 font-normal text-muted-foreground">
              ({items.length}
              {isOverdueFilter ? " 份合同" : " 期"})
            </span>
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前筛选下暂无回款计划。</p>
          ) : (
            <ScrollChainList className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {items.map((row) => {
              const remaining = getRemainingTimeInfo(row.dueAt, now);
              const assignTitle = paymentCollectionAssignTitle(row);
              const alreadyAssigned = paymentCollectionAssignTitlesForItem(row).some(
                (title) => assignedSet.has(title)
              );
              return (
                <li
                  key={
                    row.installmentIds.length > 1
                      ? `${row.contractId}-merged`
                      : row.installmentId
                  }
                  className={cn(
                    "flex min-h-[6.25rem] flex-wrap items-start justify-between gap-2 rounded-md border p-3",
                    row.overdue
                      ? "border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20"
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
                      · {periodLabel(row)} · 待收 {formatAmount(row.remainingAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.periodNumbers.length > 1 ? "最早计划到期" : "计划到期"}{" "}
                      {format(row.dueAt, "yyyy-MM-dd")}
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
          </ScrollChainList>
          )}
        </div>
      </div>
    </div>
  );
}
