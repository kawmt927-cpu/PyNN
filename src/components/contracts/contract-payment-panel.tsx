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

type PaymentRecord = {
  id: string;
  amount: number;
  paidAt: string;
  notes: string | null;
  recordedBy: { name: string };
};

type AddPaymentAction = (formData: FormData) => Promise<ActionResult>;
type DeletePaymentAction = (recordId: string) => Promise<ActionResult>;

type Props = {
  contractId: string;
  totalAmount: number;
  totalPaid: number;
  records: PaymentRecord[];
  canDelete: boolean;
  onAdd: AddPaymentAction;
  onDelete: DeletePaymentAction;
};

function todayDateInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function ContractPaymentPanel({
  contractId,
  totalAmount,
  totalPaid,
  records,
  canDelete,
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
  const [pendingDelete, setPendingDelete] = useState<PaymentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remaining = useMemo(
    () => getContractPaymentRemaining(totalAmount, totalPaid),
    [totalAmount, totalPaid]
  );
  const amountNum = Number(amountInput) || 0;
  const amountError = amountInput
    ? validateContractPaymentAmount(totalAmount, totalPaid, amountNum)
    : null;
  const canSubmitAmount = amountInput !== "" && !amountError;

  function openDialog() {
    if (remaining <= 0) return;
    setError(null);
    setAmountInput("");
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setError(null);
  }

  function handleAdd(formData: FormData) {
    formData.set("contractId", contractId);
    const amount = Number(formData.get("amount"));
    const validationError = validateContractPaymentAmount(totalAmount, totalPaid, amount);
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await onAdd(formData);
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
    setDeletingId(recordId);
    startDeleteTransition(async () => {
      setError(null);
      const result = await onDelete(recordId);
      if (result.error) {
        setError(result.error);
        setDeletingId(null);
        return;
      }
      setPendingDelete(null);
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">回款记录</CardTitle>
        <Button type="button" size="sm" onClick={openDialog} disabled={remaining <= 0}>
          登记回款
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
      {totalPaid > totalAmount + 0.01 && (
        <p className="text-sm text-destructive">
          已登记回款超出合同金额（{formatAmount(totalAmount)}），请核对或删除多余记录。
        </p>
      )}
      {remaining <= 0 && totalPaid <= totalAmount + 0.01 && (
        <p className="text-sm text-muted-foreground">合同回款已登记满额（{formatAmount(totalAmount)}）。</p>
      )}
      {error && !dialogOpen && <p className="text-sm text-destructive">{error}</p>}

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无回款记录。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">日期</th>
                <th className="pb-2 pr-4">金额</th>
                <th className="pb-2 pr-4">登记人</th>
                <th className="pb-2 pr-4">备注</th>
                {canDelete && <th className="pb-2">操作</th>}
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4">{row.paidAt.slice(0, 10)}</td>
                  <td className="py-2 pr-4">{formatAmount(row.amount)}</td>
                  <td className="py-2 pr-4">{row.recordedBy.name}</td>
                  <td className="py-2 pr-4">{row.notes ?? "—"}</td>
                  {canDelete && (
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                        onClick={() => setPendingDelete(row)}
                      >
                        {deletingId === row.id ? "删除中…" : "删除"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDestructiveDialog
        open={Boolean(pendingDelete)}
        title="删除回款记录"
        message={
          pendingDelete
            ? `确定删除 ${pendingDelete.paidAt.slice(0, 10)} 登记的回款 ${formatAmount(pendingDelete.amount)} 吗？此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>登记回款</DialogTitle>
            <DialogDescription>
              合同金额 {formatAmount(totalAmount)}，已登记 {formatAmount(totalPaid)}，剩余可登记{" "}
              {formatAmount(remaining)}。
            </DialogDescription>
          </DialogHeader>
          <form key={formKey} action={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">回款金额 *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={0.01}
                max={remaining > 0 ? remaining : undefined}
                step="0.01"
                required
                autoFocus
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setError(null);
                }}
              />
              {amountError && <p className="text-sm text-destructive">{amountError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidAt">回款日期 *</Label>
              <Input id="paidAt" name="paidAt" type="date" defaultValue={todayDateInput()} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">备注</Label>
              <Textarea id="notes" name="notes" rows={3} placeholder="可选" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={closeDialog}>
                取消
              </Button>
              <Button type="submit" disabled={pending || !canSubmitAmount}>
                {pending ? "提交中…" : "确认登记"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      </CardContent>
    </Card>
  );
}
