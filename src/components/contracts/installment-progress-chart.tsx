"use client";

import { formatAmount } from "@/lib/opportunities/funnel";
import type { InstallmentWaterfallRow } from "@/lib/contracts/payment-waterfall";
import { cn } from "@/lib/utils";

type Props = {
  rows: InstallmentWaterfallRow[];
  totalPaid: number;
  totalAmount: number;
  now?: Date;
};

function barTone(percent: number) {
  if (percent >= 100) return "bg-emerald-500";
  if (percent > 0) return "bg-sky-500";
  return "bg-muted";
}

export function InstallmentProgressChart({ rows, totalPaid, totalAmount, now = new Date() }: Props) {
  const overallPercent = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">合同回款进度</p>
            <p className="text-lg font-semibold">
              {formatAmount(totalPaid)} / {formatAmount(totalAmount)}
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-primary">
            {overallPercent.toFixed(0)}%
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const dueDate = row.dueAt ? new Date(row.dueAt) : null;
          const isOverdue =
            dueDate &&
            row.percentComplete < 100 &&
            (() => {
              const d = new Date(dueDate);
              d.setHours(0, 0, 0, 0);
              return d < today;
            })();

          return (
          <div key={row.id} className={cn("space-y-2", isOverdue && "rounded-lg border border-red-200 bg-red-50/40 p-2 dark:border-red-900 dark:bg-red-950/20")}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="font-medium">
                第 {row.periodNumber} 期
                {row.condition ? (
                  <span className="ml-2 font-normal text-muted-foreground">{row.condition}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>
                  {formatAmount(row.allocatedAmount)} / {formatAmount(row.amount)}
                  <span className="ml-1.5 text-xs">
                    （本期占合同{" "}
                    {totalAmount > 0
                      ? ((row.amount / totalAmount) * 100).toFixed(1)
                      : "0.0"}
                    % · 本期已回 {row.percentComplete.toFixed(0)}%）
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    isOverdue && "bg-red-100 text-red-800",
                    !isOverdue && row.statusLabel === "已完成" && "bg-emerald-100 text-emerald-800",
                    !isOverdue && row.statusLabel === "进行中" && "bg-sky-100 text-sky-800",
                    !isOverdue && row.statusLabel === "未开始" && "bg-muted text-muted-foreground"
                  )}
                >
                  {isOverdue ? "已逾期" : row.statusLabel}
                </span>
              </div>
            </div>
            <div className="relative h-6 overflow-hidden rounded-md bg-muted">
              <div
                className={cn("absolute inset-y-0 left-0 transition-all", barTone(row.percentComplete))}
                style={{ width: `${Math.min(100, row.percentComplete)}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground/80">
                {row.percentComplete.toFixed(0)}%
              </div>
            </div>
            {row.dueAt ? (
              <p className={cn("text-xs", isOverdue ? "font-medium text-red-700" : "text-muted-foreground")}>
                计划到期：{new Date(row.dueAt).toISOString().slice(0, 10)}
                {isOverdue ? "（已逾期）" : ""}
              </p>
            ) : null}
          </div>
          );
        })}
      </div>
    </div>
  );
}
