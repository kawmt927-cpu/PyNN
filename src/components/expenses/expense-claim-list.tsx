"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { deleteExpenseClaim } from "@/app/(dashboard)/expenses/actions";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { cn } from "@/lib/utils";

export type ExpenseClaimListRow = {
  id: string;
  title: string;
  /** 报销金额展示，如 ¥12.00 */
  amountLabel: string;
  /** 列表状态文案：草稿 / 审批中 / 已通过 / 已驳回 */
  statusLabel: string;
  /** 四态芯片色 */
  statusChip?: "draft" | "pending" | "approved" | "rejected";
  at: Date | null;
  /** 出差时间区间，如 09-02 ~ 09-25 */
  timeRangeLabel?: string | null;
  canDelete?: boolean;
  /** 报销种类：差旅 / 费用 / 项目 */
  kindLabel?: string;
  /** 类型副文案，如「交通 · 餐费」 */
  kindSubLabel?: string | null;
  /** 出差地点聚合 */
  placesLabel?: string | null;
  /** 驳回原因摘要（列表下行） */
  rejectReason?: string | null;
};

function statusChipClass(chip?: ExpenseClaimListRow["statusChip"]) {
  switch (chip) {
    case "draft":
      return "bg-muted text-muted-foreground";
    case "pending":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
    case "approved":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "rejected":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function useDeleteClaim() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function requestDelete(id: string, title: string) {
    setError(null);
    setTarget({ id, title });
  }

  function cancel() {
    if (pending) return;
    setTarget(null);
    setError(null);
  }

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const result = await deleteExpenseClaim(target.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTarget(null);
      setError(null);
      router.refresh();
    });
  }

  const dialog = (
    <ConfirmDestructiveDialog
      open={!!target}
      title="确认删除报销"
      message={
        error
          ? error
          : `确定删除「${target?.title ?? ""}」？删除后不可恢复。`
      }
      confirmLabel="删除"
      pending={pending}
      onCancel={cancel}
      onConfirm={confirm}
    />
  );

  return { pending, requestDelete, dialog };
}

export function ExpenseClaimTable({
  rows,
  hrefPrefix = "/expenses",
}: {
  rows: ExpenseClaimListRow[];
  hrefPrefix?: string;
}) {
  const { pending, requestDelete, dialog } = useDeleteClaim();
  const showKind = rows.some((r) => r.kindLabel);
  const showPlaces = rows.some((r) => r.placesLabel);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {showKind ? <th className="pb-2 pr-4">类型</th> : null}
              <th className="pb-2 pr-4">金额</th>
              {showPlaces ? <th className="pb-2 pr-4">出差地点</th> : null}
              <th className="pb-2 pr-4">时间</th>
              <th className="pb-2 pr-4">状态</th>
              <th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b align-top">
                {showKind ? (
                  <td className="py-3 pr-4">
                    <div className="font-medium whitespace-nowrap">
                      {row.kindLabel ?? "—"}
                    </div>
                    {row.kindSubLabel ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.kindSubLabel}
                      </div>
                    ) : null}
                    {row.rejectReason ? (
                      <div className="mt-1 max-w-xs text-xs text-destructive">
                        已驳回：{row.rejectReason}
                      </div>
                    ) : null}
                  </td>
                ) : null}
                <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
                  {row.amountLabel}
                </td>
                {showPlaces ? (
                  <td className="py-3 pr-4 max-w-[14rem] text-muted-foreground">
                    {row.placesLabel || "—"}
                  </td>
                ) : null}
                <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                  {row.timeRangeLabel
                    ? row.timeRangeLabel
                    : row.at
                      ? format(row.at, "MM-dd HH:mm")
                      : "—"}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                      statusChipClass(row.statusChip)
                    )}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`${hrefPrefix}/${row.id}`}
                      className="text-primary hover:underline"
                    >
                      打开
                    </Link>
                    {row.canDelete ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-destructive hover:underline disabled:opacity-50"
                        onClick={() => requestDelete(row.id, row.title)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog}
    </>
  );
}

export function ExpenseClaimCards({
  rows,
  hrefPrefix = "/mobile/expenses",
}: {
  rows: ExpenseClaimListRow[];
  hrefPrefix?: string;
}) {
  const { pending, requestDelete, dialog } = useDeleteClaim();

  return (
    <>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border bg-card px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium leading-snug">
                  {row.kindLabel ?? row.title}
                </p>
                {row.kindSubLabel ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.kindSubLabel}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  statusChipClass(row.statusChip)
                )}
              >
                {row.statusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm tabular-nums">{row.amountLabel}</p>
            {row.placesLabel ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.placesLabel}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.timeRangeLabel
                ? row.timeRangeLabel
                : row.at
                  ? format(row.at, "yyyy-MM-dd HH:mm")
                  : "—"}
            </p>
            {row.rejectReason ? (
              <p className="mt-1 text-xs text-destructive">
                已驳回：{row.rejectReason}
              </p>
            ) : null}
            <div className="mt-2 flex gap-3 text-sm">
              <Link
                href={`${hrefPrefix}/${row.id}`}
                className="text-primary hover:underline"
              >
                打开
              </Link>
              {row.canDelete ? (
                <button
                  type="button"
                  disabled={pending}
                  className="text-destructive hover:underline disabled:opacity-50"
                  onClick={() => requestDelete(row.id, row.title)}
                >
                  删除
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {dialog}
    </>
  );
}
