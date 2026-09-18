"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { deleteExpenseClaim } from "@/app/(dashboard)/expenses/actions";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";

export type ExpenseClaimListRow = {
  id: string;
  title: string;
  /** 报销金额展示，如 ¥12.00 */
  amountLabel: string;
  /** 列表状态文案：草稿 / 当前待张三审批 / 待打款 / 已打款 … */
  statusLabel: string;
  at: Date | null;
  canDelete?: boolean;
  /** 报销种类：差旅 / 费用 / 项目 */
  kindLabel?: string;
};

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

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {showKind ? <th className="pb-2 pr-4">类型</th> : null}
              <th className="pb-2 pr-4">报销金额</th>
              <th className="pb-2 pr-4">状态</th>
              <th className="pb-2 pr-4">时间</th>
              <th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                {showKind ? (
                  <td className="py-3 pr-4 whitespace-nowrap font-medium">
                    {row.kindLabel ?? "—"}
                  </td>
                ) : null}
                <td className="py-3 pr-4 tabular-nums">{row.amountLabel}</td>
                <td className="py-3 pr-4">{row.statusLabel}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  {row.at ? format(row.at, "yyyy-MM-dd HH:mm") : "—"}
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
              <p className="min-w-0 font-medium leading-snug">
                {row.kindLabel ?? row.title}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.statusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm tabular-nums">{row.amountLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.at ? format(row.at, "yyyy-MM-dd HH:mm") : "—"}
            </p>
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
