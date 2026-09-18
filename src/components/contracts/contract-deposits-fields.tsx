"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nextClientKey } from "@/lib/ui/stable-client-key";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

export type DepositLine = {
  key: string;
  id?: string;
  hasRecoveries?: boolean;
  amount: string;
  paidOutAt: string;
  recoverCondition: string;
  notes: string;
};

type Props = {
  deposits: DepositLine[];
  onChange: (deposits: DepositLine[]) => void;
};

function newKey() {
  return nextClientKey("deposit");
}

export function defaultDepositLine(): DepositLine {
  return {
    key: newKey(),
    amount: "",
    paidOutAt: "",
    recoverCondition: "",
    notes: "",
  };
}

export function ContractDepositsFields({ deposits, onChange }: Props) {
  function updateRow(key: string, patch: Partial<DepositLine>) {
    onChange(deposits.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(row: DepositLine) {
    if (row.hasRecoveries) {
      window.alert("已有收回记录的保证金不能删除，请先在合同详情删除收回登记");
      return;
    }
    if (!confirmDestructiveAction(`确定删除这笔保证金？需保存合同后才会生效。`)) {
      return;
    }
    onChange(deposits.filter((item) => item.key !== row.key));
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">保证金</h2>
          <p className="text-xs text-muted-foreground">
            独立于内外部成本；不计入项目成本；支出计入年度总成本；未收回计入待回款。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...deposits, defaultDepositLine()])}
        >
          添加保证金
        </Button>
      </div>

      {deposits.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无保证金，可按需添加。</p>
      ) : (
        <ul className="space-y-3">
          {deposits.map((row, index) => (
            <li key={row.key} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">保证金 {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeRow(row)}
                >
                  删除
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>金额 *</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>支出日期 *</Label>
                  <Input
                    type="date"
                    value={row.paidOutAt}
                    onChange={(e) => updateRow(row.key, { paidOutAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>收回条件</Label>
                  <Input
                    value={row.recoverCondition}
                    onChange={(e) => updateRow(row.key, { recoverCondition: e.target.value })}
                    placeholder="如：验收后 30 天内退还"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Input
                  value={row.notes}
                  onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                  placeholder="可选"
                />
              </div>
              {row.hasRecoveries ? (
                <p className="text-xs text-amber-700">已有收回记录，金额不得低于已收回合计。</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
