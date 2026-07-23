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
import {
  getContractPaymentRemaining,
  validateContractPaymentAmount,
} from "@/lib/contracts/payment-waterfall";
import { formatAmount } from "@/lib/opportunities/funnel";

type PayoutRecord = {
  id: string;
  amount: number;
  paidAt: string;
  notes: string | null;
  recordedBy: { name: string };
};

type Installment = {
  periodNumber: number;
  amount: number;
  condition: string | null;
  dueAt: string | null;
};

type Props = {
  productId: string;
  productName: string;
  costAmount: number;
  totalPaid: number;
  installments: Installment[];
  records: PayoutRecord[];
  canDelete: boolean;
  /** 列表页紧凑模式：仅保留登记实付按钮与弹窗 */
  compact?: boolean;
  onAdd: (formData: FormData) => Promise<ActionResult>;
  onDelete: (recordId: string) => Promise<ActionResult>;
};

function todayDateInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function ExternalCostPayoutPanel({
  productId,
  productName,
  costAmount,
  totalPaid,
  installments,
  records,
  canDelete,
  compact = false,
  onAdd,
  onDelete,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PayoutRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remaining = useMemo(
    () => getContractPaymentRemaining(costAmount, totalPaid),
    [costAmount, totalPaid]
  );
  const amountNum = Number(amountInput) || 0;
  const amountError = amountInput
    ? validateContractPaymentAmount(costAmount, totalPaid, amountNum)
    : null;
  const canSubmitAmount = amountInput !== "" && !amountError;

  function openDialog() {
    if (remaining <= 0) return;
    setError(null);
    setAmountInput("");
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  }

  function handleAdd(formData: FormData) {
    formData.set("contractProductId", productId);
    const amount = Number(formData.get("amount"));
    const validationError = validateContractPaymentAmount(costAmount, totalPaid, amount);
    if (validationError) {
      setError(validationError.replace("回款", "实付").replace("合同金额", "应付总额"));
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await onAdd(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDialogOpen(false);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const recordId = pendingDelete.id;
    setDeletingId(recordId);
    startDeleteTransition(async () => {
      setError(null);
      const result = await onDelete(recordId);
      setPendingDelete(null);
      setDeletingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const dialogs = (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>登记外部成本实付</DialogTitle>
            <DialogDescription>
              {productName} · 待付 {formatAmount(remaining)}
            </DialogDescription>
          </DialogHeader>
          <form key={formKey} action={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`ext-payout-amount-${productId}`}>实付金额 *</Label>
              <Input
                id={`ext-payout-amount-${productId}`}
                name="amount"
                type="number"
                min={0.01}
                step="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              {amountError ? (
                <p className="text-xs text-destructive">
                  {amountError.replace("回款", "实付").replace("合同金额", "应付总额")}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ext-payout-date-${productId}`}>付款日期 *</Label>
              <Input
                id={`ext-payout-date-${productId}`}
                name="paidAt"
                type="date"
                required
                defaultValue={todayDateInput()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ext-payout-notes-${productId}`}>备注</Label>
              <Textarea id={`ext-payout-notes-${productId}`} name="notes" rows={2} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending || !canSubmitAmount}>
                {pending ? "保存中…" : "确认"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={Boolean(pendingDelete)}
        title="删除实付记录"
        message={
          pendingDelete
            ? `确定删除 ${formatAmount(pendingDelete.amount)} 的实付记录？`
            : "确定删除该实付记录？"
        }
        confirmLabel="删除"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
      />
    </>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button type="button" size="sm" disabled={remaining <= 0} onClick={openDialog}>
          登记实付
        </Button>
        {dialogs}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">外部成本实付 · {productName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            应付 {formatAmount(costAmount)} · 已付 {formatAmount(totalPaid)} · 待付{" "}
            {formatAmount(remaining)}
          </p>
        </div>
        <Button type="button" size="sm" disabled={remaining <= 0} onClick={openDialog}>
          登记实付
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {installments.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">付款计划</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {installments.map((row) => (
                <li key={row.periodNumber}>
                  第 {row.periodNumber} 期 · {formatAmount(row.amount)}
                  {row.condition ? ` · ${row.condition}` : ""}
                  {row.dueAt
                    ? ` · ${new Date(row.dueAt).toLocaleDateString("zh-CN")}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无实付记录</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {records.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"
              >
                <span>
                  {formatAmount(row.amount)} ·{" "}
                  {new Date(row.paidAt).toLocaleDateString("zh-CN")} · {row.recordedBy.name}
                  {row.notes ? ` · ${row.notes}` : ""}
                </span>
                {canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deletePending && deletingId === row.id}
                    onClick={() => setPendingDelete(row)}
                  >
                    删除
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {dialogs}
    </Card>
  );
}
