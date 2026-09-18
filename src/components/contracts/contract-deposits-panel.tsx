"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { formatAmount } from "@/lib/opportunities/funnel";

type RecoveryRecord = {
  id: string;
  amount: number;
  recoveredAt: string;
  notes: string | null;
  recordedBy: { name: string };
};

type DepositRow = {
  id: string;
  amount: number;
  paidOutAt: string;
  recoverCondition: string | null;
  notes: string | null;
  recoveredAmount: number;
  outstandingAmount: number;
  recoveries: RecoveryRecord[];
};

type Props = {
  deposits: DepositRow[];
  canRecord: boolean;
  canDelete: boolean;
  onAddRecovery: (formData: FormData) => Promise<ActionResult>;
  onDeleteRecovery: (recordId: string) => Promise<ActionResult>;
};

function todayDateInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function ContractDepositsPanel({
  deposits,
  canRecord,
  canDelete,
  onAddRecovery,
  onDeleteRecovery,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [activeDepositId, setActiveDepositId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RecoveryRecord | null>(null);

  const activeDeposit = useMemo(
    () => deposits.find((row) => row.id === activeDepositId) ?? null,
    [deposits, activeDepositId]
  );

  if (deposits.length === 0) {
    return null;
  }

  function openRecover(depositId: string) {
    setError(null);
    setAmountInput("");
    setFormKey((k) => k + 1);
    setActiveDepositId(depositId);
  }

  function closeDialog() {
    setActiveDepositId(null);
    setError(null);
  }

  function handleAdd(formData: FormData) {
    if (!activeDeposit) return;
    formData.set("depositId", activeDeposit.id);
    const amount = Number(formData.get("amount"));
    if (!(amount > 0)) {
      setError("收回金额须大于 0");
      return;
    }
    if (amount > activeDeposit.outstandingAmount + 0.01) {
      setError(`收回金额不能超过未收回 ${formatAmount(activeDeposit.outstandingAmount)}`);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await onAddRecovery(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      closeDialog();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const recordId = pendingDelete.id;
    startDeleteTransition(async () => {
      setError(null);
      const result = await onDeleteRecovery(recordId);
      setPendingDelete(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">保证金</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            不计入项目成本；支出计入年度总成本；未收回计入待回款；收回计入当年已回款。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {deposits.map((row, index) => (
            <div key={row.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">保证金 {index + 1}</p>
                  <p className="text-xs text-muted-foreground">
                    支出 {row.paidOutAt.slice(0, 10)}
                    {row.recoverCondition ? ` · ${row.recoverCondition}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium tabular-nums">{formatAmount(row.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    已收回 {formatAmount(row.recoveredAmount)} · 未收回{" "}
                    {formatAmount(row.outstandingAmount)}
                  </p>
                </div>
              </div>
              {canRecord && row.outstandingAmount > 0.01 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => openRecover(row.id)}>
                  登记收回
                </Button>
              ) : null}
              {row.recoveries.length > 0 ? (
                <ul className="divide-y border-t pt-2">
                  {row.recoveries.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 py-2 text-sm first:pt-2"
                    >
                      <div className="min-w-0">
                        <p className="tabular-nums">{formatAmount(item.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.recoveredAt.slice(0, 10)} · {item.recordedBy.name}
                          {item.notes ? ` · ${item.notes}` : ""}
                        </p>
                      </div>
                      {canDelete ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setPendingDelete(item)}
                        >
                          删除
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={activeDepositId != null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent showCloseButton className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>登记保证金收回</DialogTitle>
            <DialogDescription>
              未收回余额 {activeDeposit ? formatAmount(activeDeposit.outstandingAmount) : "—"}
            </DialogDescription>
          </DialogHeader>
          <form key={formKey} action={handleAdd} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="deposit-recover-amount">金额 *</Label>
              <Input
                id="deposit-recover-amount"
                name="amount"
                type="number"
                min={0}
                step="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deposit-recover-at">收回日期 *</Label>
              <Input
                id="deposit-recover-at"
                name="recoveredAt"
                type="date"
                required
                defaultValue={todayDateInput()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deposit-recover-notes">备注</Label>
              <Textarea id="deposit-recover-notes" name="notes" rows={2} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "提交中…" : "确认"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={pendingDelete != null}
        title="删除收回记录"
        message={
          pendingDelete
            ? `确定删除 ${formatAmount(pendingDelete.amount)} 的保证金收回记录？`
            : ""
        }
        confirmLabel="删除"
        pending={deletePending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
