"use client";

import { formatAmount } from "@/lib/opportunities/funnel";
import type { InstallmentWaterfallRow } from "@/lib/contracts/payment-waterfall";
import { cn } from "@/lib/utils";

type Props = {
  rows: InstallmentWaterfallRow[];
  totalPaid: number;
  totalAmount: number;
};

function barTone(percent: number) {
  if (percent >= 100) return "bg-emerald-500";
  if (percent > 0) return "bg-sky-500";
  return "bg-muted";
}

export function InstallmentProgressChart({ rows, totalPaid, totalAmount }: Props) {
  const overallPercent = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;

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
        {rows.map((row) => (
          <div key={row.id} className="space-y-2">
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
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    row.statusLabel === "已完成" && "bg-emerald-100 text-emerald-800",
                    row.statusLabel === "进行中" && "bg-sky-100 text-sky-800",
                    row.statusLabel === "未开始" && "bg-muted text-muted-foreground"
                  )}
                >
                  {row.statusLabel} · {row.percentComplete.toFixed(0)}%
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
              <p className="text-xs text-muted-foreground">
                计划到期：{new Date(row.dueAt).toISOString().slice(0, 10)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
