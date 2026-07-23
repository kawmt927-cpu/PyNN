"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { updateExternalCostPlan } from "@/app/(dashboard)/contracts/actions";
import { validateInstallmentCoverage } from "@/lib/validations/contract";
import { formatAmount } from "@/lib/opportunities/funnel";
import { nextClientKey } from "@/lib/ui/stable-client-key";

type PlanRow = {
  key: string;
  periodNumber: number;
  amount: string;
  condition: string;
  dueAt: string;
};

type Props = {
  productId: string;
  productName: string;
  costAmount: number;
  installments: Array<{
    periodNumber: number;
    amount: number;
    condition: string | null;
    dueAt: string | null;
  }>;
};

function newKey() {
  return nextClientKey("ext-plan");
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function ExternalCostPlanEditDialog({
  productId,
  productName,
  costAmount,
  installments,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<PlanRow[]>([]);

  function openDialog() {
    setError(null);
    setRows(
      installments.length
        ? installments.map((row) => ({
            key: newKey(),
            periodNumber: row.periodNumber,
            amount: String(row.amount),
            condition: row.condition ?? "",
            dueAt: toDateInput(row.dueAt),
          }))
        : [{ key: newKey(), periodNumber: 1, amount: "", condition: "", dueAt: "" }]
    );
    setOpen(true);
  }

  const planSum = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [rows]
  );
  const coverageError = validateInstallmentCoverage(costAmount, rows.map((r) => ({
    amount: Number(r.amount) || 0,
  })));

  function handleSave() {
    const formData = new FormData();
    formData.set("contractProductId", productId);
    formData.set("costAmount", String(costAmount));
    formData.set(
      "installmentsJson",
      JSON.stringify(
        rows.map((row) => ({
          periodNumber: row.periodNumber,
          amount: Number(row.amount) || 0,
          condition: row.condition.trim() || null,
          dueAt: row.dueAt || null,
        }))
      )
    );

    startTransition(async () => {
      setError(null);
      const result: ActionResult = await updateExternalCostPlan(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        调整计划
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" scrollable>
          <DialogHeader>
            <DialogTitle>调整外部付款计划</DialogTitle>
            <DialogDescription>{productName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>应付总额</Label>
              <p className="text-sm font-medium">{formatAmount(costAmount)}</p>
              <p className="text-xs text-muted-foreground">
                应付总额不可在此修改，请到合同编辑页调整成本构成。
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                计划合计 {formatAmount(planSum)}
                {coverageError ? (
                  <span className="ml-2 text-destructive">
                    {coverageError
                      .replace("回款计划", "付款计划")
                      .replace("合同金额", "应付总额")}
                  </span>
                ) : null}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    {
                      key: newKey(),
                      periodNumber: prev.length + 1,
                      amount: "",
                      condition: "",
                      dueAt: "",
                    },
                  ])
                }
              >
                添加期次
              </Button>
            </div>
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.key} className="grid gap-2 md:grid-cols-12">
                  <div className="md:col-span-2 space-y-1">
                    <Label>期次</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.periodNumber}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key
                              ? { ...item, periodNumber: Number(e.target.value) || 1 }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label>金额</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.amount}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key
                              ? { ...item, amount: e.target.value }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label>条件</Label>
                    <Input
                      value={row.condition}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key
                              ? { ...item, condition: e.target.value }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label>到期</Label>
                    <Input
                      type="date"
                      value={row.dueAt}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, dueAt: e.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="flex items-end md:col-span-1">
                    {rows.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRows((prev) => prev.filter((item) => item.key !== row.key))
                        }
                      >
                        删
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                disabled={pending || Boolean(coverageError)}
                onClick={handleSave}
              >
                {pending ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
