"use client";

import { useMemo, useState, useTransition } from "react";
import { PersonnelType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import { formatAmount } from "@/lib/opportunities/funnel";
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
};

export function PersonnelInfoTable({ items, year, month, monthWorkdays }: Props) {
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
        (item) => (types[item.userId] ?? "NONE") !== (savedBaseline[item.userId] ?? "NONE")
      ),
    [items, types, savedBaseline]
  );

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updatePersonnelTypesBatch(
        items.map((item) => ({
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
          维护人员类型；展示 {year}年{month}月 月成本与本月投入概况（工作日 {monthWorkdays} 天）。
          成本明细请到「人员成本」标签编辑。
        </p>
        {isDirty ? (
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "保存中…" : "保存类型"}
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 text-center">姓名</th>
              <th className="px-2 py-2">类型</th>
              <th className="px-2 py-2">当月月成本</th>
              <th className="px-2 py-2">当月调整</th>
              <th className="px-2 py-2">有效月成本</th>
              <th className="px-2 py-2">本月人天</th>
              <th className="px-2 py-2">本月人力成本</th>
              <th className="px-2 py-2">参与项目</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.userId} className="border-b align-middle">
                <td className="px-3 py-2 text-center font-medium">{item.name}</td>
                <td className="px-2 py-2 min-w-[130px]">
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
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                  {item.monthlyCost != null ? formatAmount(item.monthlyCost) : "—"}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                  {item.monthAdjustment !== 0
                    ? formatAmount(item.monthAdjustment)
                    : "—"}
                </td>
                <td className="px-2 py-2 whitespace-nowrap font-medium">
                  {item.effectiveMonthlyCost != null
                    ? formatAmount(item.effectiveMonthlyCost)
                    : "—"}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{item.monthEffectiveDays}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {item.monthCost > 0 ? formatAmount(item.monthCost) : "—"}
                </td>
                <td className="px-2 py-2">{item.projectCount}</td>
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
