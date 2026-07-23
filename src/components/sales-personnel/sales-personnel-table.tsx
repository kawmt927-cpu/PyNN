"use client";

import { useMemo, useState, useTransition } from "react";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/permissions";
import { updateSalesPersonnelFlagsBatch } from "@/app/(dashboard)/sales-personnel/actions";

export type SalesPersonnelItem = {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  enabled: boolean;
  includeInTeamPerformance: boolean;
  includeInMonthlyAssessment: boolean;
};

type Props = {
  items: SalesPersonnelItem[];
};

type FlagKey = "team" | "monthly";

export function SalesPersonnelTable({ items }: Props) {
  const [teamFlags, setTeamFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      items.map((item) => [item.userId, item.enabled && item.includeInTeamPerformance])
    )
  );
  const [monthlyFlags, setMonthlyFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      items.map((item) => [item.userId, item.enabled && item.includeInMonthlyAssessment])
    )
  );
  const [savedTeam, setSavedTeam] = useState<Record<string, boolean>>(() => ({ ...teamFlags }));
  const [savedMonthly, setSavedMonthly] = useState<Record<string, boolean>>(() => ({
    ...monthlyFlags,
  }));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const editableItems = useMemo(() => items.filter((item) => item.enabled), [items]);

  const isDirty = useMemo(
    () =>
      editableItems.some(
        (item) =>
          (teamFlags[item.userId] ?? false) !== (savedTeam[item.userId] ?? false) ||
          (monthlyFlags[item.userId] ?? false) !== (savedMonthly[item.userId] ?? false)
      ),
    [editableItems, teamFlags, monthlyFlags, savedTeam, savedMonthly]
  );

  function setFlag(key: FlagKey, userId: string, checked: boolean) {
    if (key === "team") {
      setTeamFlags((prev) => ({ ...prev, [userId]: checked }));
    } else {
      setMonthlyFlags((prev) => ({ ...prev, [userId]: checked }));
    }
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSalesPersonnelFlagsBatch(
        items.map((item) => ({
          userId: item.userId,
          includeInTeamPerformance: item.enabled ? (teamFlags[item.userId] ?? false) : false,
          includeInMonthlyAssessment: item.enabled
            ? (monthlyFlags[item.userId] ?? false)
            : false,
        }))
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedTeam({ ...teamFlags });
      setSavedMonthly({ ...monthlyFlags });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          列出销售、销售管理、管理员。「参与团队业绩」计入年度团队汇总与今日工作团队动态；「参与月度考核」出现在月度
          KPI 查看与目标设定名单中。停用人员不可勾选。后续可迁入角色/个人功能权限配置。
        </p>
        {isDirty ? (
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">角色</th>
              <th className="px-3 py-2">手机 / 邮箱</th>
              <th className="px-3 py-2">档案</th>
              <th className="px-3 py-2 text-center">参与团队业绩</th>
              <th className="px-3 py-2 text-center">参与月度考核</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.userId} className="border-b align-middle">
                <td className="px-3 py-2 font-medium">{item.name}</td>
                <td className="px-3 py-2">{ROLE_LABELS[item.role] ?? item.role}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {item.phone || item.email || "—"}
                </td>
                <td className="px-3 py-2">
                  {item.enabled ? (
                    <span className="text-emerald-700">启用</span>
                  ) : (
                    <span className="text-muted-foreground">停用 / 无档案</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {item.enabled ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={teamFlags[item.userId] ?? false}
                      onChange={(e) => setFlag("team", item.userId, e.target.checked)}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {item.enabled ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={monthlyFlags[item.userId] ?? false}
                      onChange={(e) => setFlag("monthly", item.userId, e.target.checked)}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">暂无销售功能人员。</p>
        ) : null}
      </div>
    </div>
  );
}
