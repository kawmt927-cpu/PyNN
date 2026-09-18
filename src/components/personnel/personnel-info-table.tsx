"use client";

import { useMemo, useState, useTransition } from "react";
import { PersonnelType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import { formatAmount } from "@/lib/opportunities/funnel";
import { cn } from "@/lib/utils";
import { updatePersonnelTypesBatch } from "@/app/(dashboard)/personnel/actions";

export type PersonnelInfoItem = {
  userId: string;
  name: string;
  email: string | null;
  personnelType: PersonnelType | null;
  monthlyCost: number | null;
  effectiveMonthlyCost: number | null;
  monthAdjustment: number;
  monthEffectiveDays: number;
  monthCost: number;
  projectCount: number;
  resigned?: boolean;
  /** 离职且当月无排期：数值列显示为 — */
  hideMonthMetrics?: boolean;
};

const TYPE_OPTIONS = [
  { value: "NONE", label: "未设置" },
  ...(Object.keys(PERSONNEL_TYPE_LABELS) as PersonnelType[]).map((type) => ({
    value: type,
    label: PERSONNEL_TYPE_LABELS[type],
  })),
];

function typeValue(value: PersonnelType | null | undefined): string {
  return value ?? "NONE";
}

type Props = {
  items: PersonnelInfoItem[];
  year: number;
  month: number;
  monthWorkdays: number;
  /** 是否可编辑人员类型；默认 true */
  canEditTypes?: boolean;
  /** 是否展示薪资/人力成本列；项目管理员仅看投入概况 */
  showCostColumns?: boolean;
};

export function PersonnelInfoTable({
  items,
  year,
  month,
  monthWorkdays,
  canEditTypes = true,
  showCostColumns = true,
}: Props) {
  const [types, setTypes] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.userId, typeValue(item.personnelType)]))
  );
  const [savedBaseline, setSavedBaseline] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.userId, typeValue(item.personnelType)]))
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(
    () =>
      items.some(
        (item) =>
          !item.resigned &&
          (types[item.userId] ?? "NONE") !== (savedBaseline[item.userId] ?? "NONE")
      ),
    [items, types, savedBaseline]
  );

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updatePersonnelTypesBatch(
        items
          .filter((item) => !item.resigned)
          .map((item) => ({
            userId: item.userId,
            personnelType: types[item.userId] ?? "NONE",
          }))
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedBaseline({ ...types });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {canEditTypes
            ? "维护人员类型；展示当月投入概况。"
            : "查看人员类型与当月投入概况（只读）。"}
          {showCostColumns
            ? " 成本明细请到「人员成本」标签编辑。"
            : " 月成本由行政人事在「人员成本」中维护。"}
          {` 当前 ${year}年${month}月（工作日 ${monthWorkdays} 天）。`}
        </p>
        {canEditTypes && isDirty ? (
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "保存中…" : "保存类型"}
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 text-center">姓名</th>
              <th className="px-2 py-2">类型</th>
              {showCostColumns ? (
                <>
                  <th className="px-2 py-2">当月月成本</th>
                  <th className="px-2 py-2">当月调整</th>
                  <th className="px-2 py-2">有效月成本</th>
                </>
              ) : null}
              <th className="px-2 py-2">本月人天</th>
              {showCostColumns ? (
                <th className="px-2 py-2">本月人力成本</th>
              ) : null}
              <th className="px-2 py-2">参与项目</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.userId}
                className={cn(
                  "border-b align-middle",
                  item.resigned && "bg-muted/30 text-muted-foreground"
                )}
              >
                <td className="px-3 py-2 text-center font-medium">
                  <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                    <span className={item.resigned ? "text-muted-foreground" : undefined}>
                      {item.name}
                    </span>
                    {item.resigned ? (
                      <span className="rounded bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-medium leading-none text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        离职
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-2 py-2 min-w-[130px]">
                  {canEditTypes && !item.resigned ? (
                    <SelectField
                      id={`info-type-${item.userId}`}
                      name={`info-type-${item.userId}`}
                      label=""
                      value={types[item.userId] ?? "NONE"}
                      onValueChange={(value) => {
                        setTypes((prev) => ({ ...prev, [item.userId]: value }));
                      }}
                      options={TYPE_OPTIONS}
                      className="space-y-0"
                      labelClassName="hidden min-h-0"
                    />
                  ) : (
                    <span>
                      {item.personnelType
                        ? PERSONNEL_TYPE_LABELS[item.personnelType]
                        : "未设置"}
                    </span>
                  )}
                </td>
                {showCostColumns ? (
                  <>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {item.hideMonthMetrics
                        ? "—"
                        : item.monthlyCost != null
                          ? formatAmount(item.monthlyCost)
                          : "—"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {item.hideMonthMetrics
                        ? "—"
                        : item.monthAdjustment !== 0
                          ? formatAmount(item.monthAdjustment)
                          : "—"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap font-medium">
                      {item.hideMonthMetrics
                        ? "—"
                        : item.effectiveMonthlyCost != null
                          ? formatAmount(item.effectiveMonthlyCost)
                          : "—"}
                    </td>
                  </>
                ) : null}
                <td className="px-2 py-2 whitespace-nowrap">
                  {item.hideMonthMetrics ? "—" : item.monthEffectiveDays}
                </td>
                {showCostColumns ? (
                  <td className="px-2 py-2 whitespace-nowrap">
                    {item.hideMonthMetrics
                      ? "—"
                      : item.monthCost > 0
                        ? formatAmount(item.monthCost)
                        : "—"}
                  </td>
                ) : null}
                <td className="px-2 py-2">
                  {item.hideMonthMetrics ? "—" : item.projectCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">暂无实施人员。</p>
        ) : null}
      </div>
    </div>
  );
}
