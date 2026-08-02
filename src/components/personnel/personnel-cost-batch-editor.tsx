"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/opportunities/funnel";
import {
  computeMonthlyCost,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";
import {
  updatePersonnelCostsBatch,
  type PersonnelCostRowInput,
} from "@/app/(dashboard)/personnel/actions";

export type PersonnelCostListItem = {
  userId: string;
  name: string;
  email: string | null;
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  monthAdjustment: number;
  monthAdjustmentNotes: string;
  hasMonthRecord?: boolean;
  weekEffectiveDays: number;
  weekCost: number;
  projectCount: number;
};

type RowState = {
  userId: string;
  contributionBase: string;
  baseSalary: string;
  socialSecurityCompany: string;
  housingFundCompany: string;
  monthAdjustment: string;
  monthAdjustmentNotes: string;
};

function moneyText(value: number | null): string {
  return value != null ? String(value) : "";
}

function parseMoney(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function rowsFromItems(items: PersonnelCostListItem[]): RowState[] {
  return items.map((item) => ({
    userId: item.userId,
    contributionBase: moneyText(item.contributionBase),
    baseSalary: moneyText(item.baseSalary),
    socialSecurityCompany: moneyText(item.socialSecurityCompany),
    housingFundCompany: moneyText(item.housingFundCompany),
    monthAdjustment: item.monthAdjustment !== 0 ? String(item.monthAdjustment) : "",
    monthAdjustmentNotes: item.monthAdjustmentNotes,
  }));
}

function displayMoney(raw: string): string {
  const value = parseMoney(raw);
  return value != null ? formatAmount(value) : "—";
}

type Props = {
  items: PersonnelCostListItem[];
  year: number;
  month: number;
  monthWorkdays: number;
};

export function PersonnelCostBatchEditor({ items, year, month, monthWorkdays }: Props) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<RowState[]>(() => rowsFromItems(items));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const metaByUser = useMemo(() => {
    return new Map(items.map((item) => [item.userId, item]));
  }, [items]);

  function updateRow(userId: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((row) => (row.userId === userId ? { ...row, ...patch } : row))
    );
  }

  function handleStartEdit() {
    setError(null);
    setRows(rowsFromItems(items));
    setEditing(true);
  }

  function handleCancel() {
    setError(null);
    setRows(rowsFromItems(items));
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    const payload: PersonnelCostRowInput[] = rows.map((row) => ({ ...row }));
    startTransition(async () => {
      const result = await updatePersonnelCostsBatch({ year, month, rows: payload });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {editing
            ? `编辑 ${year}年${month}月 成本并保存后，项目人力成本会按该月有效月成本 ÷ ${monthWorkdays} 工作日重新核算。「本月调整」用于请假等临时增减。`
            : `${year}年${month}月 成本为只读展示（无当月记录时沿用上月）；点击「编辑」后可修改并保存。`}
        </p>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={handleCancel} disabled={pending}>
                取消
              </Button>
              <Button type="button" onClick={handleSave} disabled={pending}>
                {pending ? "保存中…" : "保存全部"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={handleStartEdit}>
              编辑
            </Button>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-center">姓名</th>
              <th className="px-2 py-2">缴费基数</th>
              <th className="px-2 py-2">基本工资</th>
              <th className="px-2 py-2">社保公司承担</th>
              <th className="px-2 py-2">公积金公司承担</th>
              <th className="px-2 py-2">月成本</th>
              <th className="px-2 py-2">本月调整</th>
              {editing ? <th className="px-2 py-2">调整说明</th> : null}
              <th className="px-2 py-2">有效月成本</th>
              <th className="px-2 py-2">本月人天（人力成本）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = metaByUser.get(row.userId);
              const monthly = computeMonthlyCost({
                baseSalary: parseMoney(row.baseSalary),
                socialSecurityCompany: parseMoney(row.socialSecurityCompany),
                housingFundCompany: parseMoney(row.housingFundCompany),
              });
              const adjustment = parseMoney(row.monthAdjustment) ?? 0;
              const effective = resolveEffectiveMonthlyCost(monthly, adjustment);

              return (
                <tr key={row.userId} className="border-b align-top">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 text-center font-medium whitespace-nowrap">
                    {meta?.name}
                  </td>
                  {editing ? (
                    <>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={row.contributionBase}
                          onChange={(e) =>
                            updateRow(row.userId, { contributionBase: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={row.baseSalary}
                          onChange={(e) =>
                            updateRow(row.userId, { baseSalary: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={row.socialSecurityCompany}
                          onChange={(e) =>
                            updateRow(row.userId, {
                              socialSecurityCompany: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={row.housingFundCompany}
                          onChange={(e) =>
                            updateRow(row.userId, {
                              housingFundCompany: e.target.value,
                            })
                          }
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {displayMoney(row.contributionBase)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {displayMoney(row.baseSalary)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {displayMoney(row.socialSecurityCompany)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {displayMoney(row.housingFundCompany)}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    {monthly != null ? formatAmount(monthly) : "—"}
                  </td>
                  {editing ? (
                    <>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          placeholder="0"
                          value={row.monthAdjustment}
                          onChange={(e) =>
                            updateRow(row.userId, { monthAdjustment: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="w-36"
                          placeholder="如：请假 2 天"
                          value={row.monthAdjustmentNotes}
                          onChange={(e) =>
                            updateRow(row.userId, {
                              monthAdjustmentNotes: e.target.value,
                            })
                          }
                        />
                      </td>
                    </>
                  ) : (
                    <td
                      className="px-2 py-2 whitespace-nowrap text-muted-foreground"
                      title={
                        row.monthAdjustmentNotes.trim()
                          ? `调整说明：${row.monthAdjustmentNotes.trim()}`
                          : undefined
                      }
                    >
                      <span
                        className={
                          row.monthAdjustmentNotes.trim()
                            ? "cursor-help border-b border-dashed border-muted-foreground/50"
                            : undefined
                        }
                      >
                        {adjustment !== 0 ? formatAmount(adjustment) : "—"}
                      </span>
                    </td>
                  )}
                  <td className="px-2 py-2 whitespace-nowrap font-medium">
                    {effective != null ? formatAmount(effective) : "—"}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    {meta?.weekEffectiveDays ?? 0}
                    {(meta?.weekCost ?? 0) > 0 ? (
                      <span className="ml-1 text-xs">
                        ({formatAmount(meta!.weekCost)})
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">暂无实施人员。</p>
        ) : null}
      </div>
    </div>
  );
}
