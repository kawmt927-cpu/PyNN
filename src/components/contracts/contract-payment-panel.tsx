"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addContractPaymentRecord,
  deleteContractPaymentRecord,
} from "@/app/(dashboard)/contracts/actions";
import { formatAmount } from "@/lib/opportunities/funnel";

type PaymentRecord = {
  id: string;
  amount: number;
  paidAt: string;
  notes: string | null;
  recordedBy: { name: string };
};

type Props = {
  contractId: string;
  records: PaymentRecord[];
  canDelete: boolean;
};

function toDateInput(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function ContractPaymentPanel({ contractId, records, canDelete }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    formData.set("contractId", contractId);
    startTransition(async () => {
      setError(null);
      const result = await addContractPaymentRecord(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(recordId: string) {
    if (!confirm("确定删除该回款记录？")) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteContractPaymentRecord(recordId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="amount">回款金额 *</Label>
          <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paidAt">回款日期 *</Label>
          <Input
            id="paidAt"
            name="paidAt"
            type="date"
            defaultValue={toDateInput()}
            required
          />
        </div>
        <div className="space-y-2 md:col-span-3">
          <Label htmlFor="notes">备注</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>
        <div className="md:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "提交中…" : "登记回款"}
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
                        disabled={pending}
                        onClick={() => handleDelete(row.id)}
                      >
                        删除
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
