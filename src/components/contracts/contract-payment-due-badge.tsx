"use client";

import { cn } from "@/lib/utils";
import type { ContractPaymentDueBadge } from "@/lib/contracts/payment-due";

type Props = {
  summary: ContractPaymentDueBadge | undefined;
  className?: string;
};

export function ContractPaymentDueStatusBadge({ summary, className }: Props) {
  if (!summary || (!summary.hasOverdue && !summary.hasDueSoon)) return null;

  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {summary.overdueCount > 0 ? (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
          回款逾期 {summary.overdueCount} 期
        </span>
      ) : null}
      {summary.dueSoonCount > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          待收 {summary.dueSoonCount} 期
        </span>
      ) : null}
    </span>
  );
}
