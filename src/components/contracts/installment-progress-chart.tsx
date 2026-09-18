"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAmount } from "@/lib/opportunities/funnel";
import type { InstallmentWaterfallRow } from "@/lib/contracts/payment-waterfall";
import type { ActionResult } from "@/lib/action-result";
import {
  allowedManualCollectionStatuses,
  COLLECTION_STATUS_LABELS,
  resolveEffectiveCollectionStatus,
  type EffectiveCollectionStatus,
  type ManualCollectionStatus,
} from "@/lib/contracts/installment-collection-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  rows: InstallmentWaterfallRow[];
  totalPaid: number;
  totalAmount: number;
  now?: Date;
  collectionStatusById?: Record<string, ManualCollectionStatus>;
  contractId?: string;
  canEditStatus?: boolean;
  onSaveStatus?: (formData: FormData) => Promise<ActionResult>;
};

function barTone(percent: number) {
  if (percent >= 100) return "bg-emerald-500";
  if (percent > 0) return "bg-sky-500";
  return "bg-muted";
}

function statusBadgeClass(status: EffectiveCollectionStatus) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800";
    case "READY":
      return "bg-teal-100 text-teal-800";
    case "IN_COLLECTION":
      return "bg-sky-100 text-sky-800";
    case "DIFFICULT":
      return "bg-amber-100 text-amber-800";
    case "BAD_DEBT":
      return "bg-rose-100 text-rose-900";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function InstallmentProgressChart({
  rows,
  totalPaid,
  totalAmount,
  now = new Date(),
  collectionStatusById = {},
  contractId,
  canEditStatus = false,
  onSaveStatus,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() => ({ ...collectionStatusById }));
  const overallPercent = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const canEdit = canEditStatus && Boolean(contractId) && Boolean(onSaveStatus);

  function setStatus(installmentId: string, next: ManualCollectionStatus) {
    if (!contractId || !onSaveStatus) return;
    const prev = drafts[installmentId] ?? "NOT_STARTED";
    setDrafts((d) => ({ ...d, [installmentId]: next }));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("contractId", contractId);
      fd.set("installmentId", installmentId);
      fd.set("collectionStatus", next);
      const result = await onSaveStatus(fd);
      if (result.error) {
        setDrafts((d) => ({ ...d, [installmentId]: prev }));
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

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
        <p className="mt-2 text-xs text-muted-foreground">
          进度条按累计回款瀑布分配；右侧状态标签可点击修改（「已完成」由回款满额自动产生，不可手改；有回款时不可回退为「未开始」）。
        </p>
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

          const stored = drafts[row.id] ?? collectionStatusById[row.id] ?? "NOT_STARTED";
          const effective = resolveEffectiveCollectionStatus({
            percentComplete: row.percentComplete,
            collectionStatus: stored,
          });
          const options = allowedManualCollectionStatuses(row.percentComplete);
          const editable = canEdit && effective !== "COMPLETED" && options.length > 0;

          const badge = (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusBadgeClass(effective),
                editable && "cursor-pointer hover:opacity-90",
                pending && "opacity-60"
              )}
            >
              {COLLECTION_STATUS_LABELS[effective]}
              {editable ? <span className="ml-1 opacity-60">▾</span> : null}
            </span>
          );

          return (
            <div
              key={row.id}
              className={cn(
                "space-y-2",
                isOverdue &&
                  "rounded-lg border border-red-200 bg-red-50/40 p-2 dark:border-red-900 dark:bg-red-950/20"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="font-medium">
                  第 {row.periodNumber} 期
                  {row.condition ? (
                    <span className="ml-2 font-normal text-muted-foreground">{row.condition}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
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
                  {editable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild disabled={pending}>
                        <button type="button" className="outline-none">
                          {badge}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {options.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            disabled={status === stored}
                            onSelect={() => setStatus(row.id, status)}
                          >
                            {COLLECTION_STATUS_LABELS[status]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    badge
                  )}
                  {isOverdue ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      已逾期
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="relative h-6 overflow-hidden rounded-md bg-muted">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all",
                    barTone(row.percentComplete)
                  )}
                  style={{ width: `${Math.min(100, row.percentComplete)}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground/80">
                  {row.percentComplete.toFixed(0)}%
                </div>
              </div>
              {row.dueAt ? (
                <p
                  className={cn(
                    "text-xs",
                    isOverdue ? "font-medium text-red-700" : "text-muted-foreground"
                  )}
                >
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
