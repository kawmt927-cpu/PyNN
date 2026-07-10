"use client";

import { useState, useTransition } from "react";
import { AllocationMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import {
  createProjectAllocation,
  deleteProjectAllocation,
} from "@/app/(dashboard)/projects/allocation-actions";

export type AllocationListItem = {
  id: string;
  userId: string;
  userName: string;
  startDate: Date;
  endDate: Date;
  allocationMode: AllocationMode;
  plannedDays: number | null;
  effectiveDays: number;
  dailyRateSnapshot: number;
  cost: number;
};

type StaffOption = { id: string; name: string; dailyRate: number | null };

type Props = {
  projectId: string;
  allocations: AllocationListItem[];
  staffOptions: StaffOption[];
  canEdit: boolean;
};

export function AllocationListPanel({
  projectId,
  allocations,
  staffOptions,
  canEdit,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AllocationMode>("AUTO");
  const [deleteTarget, setDeleteTarget] = useState<AllocationListItem | null>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    formData.set("projectId", projectId);
    formData.set("allocationMode", mode);
    startTransition(async () => {
      const result = await createProjectAllocation(formData);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("allocationId", deleteTarget.id);
    fd.set("projectId", projectId);
    startTransition(async () => {
      const result = await deleteProjectAllocation(fd);
      if (result.error) setError(result.error);
      else setDeleteTarget(null);
    });
  }

  const today = formatLocalDateInput(new Date());

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        默认 AUTO 模式：同一人同一天在多个项目有投入时，系统自动等比例拆分人天（如 4 个项目各 0.25
        人日/天）。甘特拖拽排班将在后续迭代提供。
      </p>

      {canEdit ? (
        <form
          action={handleCreate}
          className="rounded-md border p-4 space-y-3"
        >
          <p className="text-sm font-medium">添加人力投入</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <SelectField
              id="userId"
              name="userId"
              label="人员"
              required
              options={staffOptions.map((s) => ({
                value: s.id,
                label: `${s.name}${s.dailyRate != null ? `（¥${s.dailyRate}/天）` : ""}`,
              }))}
            />
            <div className="space-y-2">
              <Label htmlFor="startDate">开始日期</Label>
              <Input id="startDate" name="startDate" type="date" required defaultValue={today} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">结束日期</Label>
              <Input id="endDate" name="endDate" type="date" required defaultValue={today} />
            </div>
            <SelectField
              id="allocationMode"
              name="allocationMode"
              label="模式"
              value={mode}
              onValueChange={(v) => setMode(v as AllocationMode)}
              options={(
                Object.keys(ALLOCATION_MODE_LABELS) as AllocationMode[]
              ).map((key) => ({
                value: key,
                label: ALLOCATION_MODE_LABELS[key],
              }))}
            />
            {mode === "MANUAL" ? (
              <div className="space-y-2">
                <Label htmlFor="plannedDays" className="block min-h-5 leading-5">
                  锁定单日人天
                </Label>
                <Input
                  id="plannedDays"
                  name="plannedDays"
                  type="number"
                  min="0.01"
                  max="1"
                  step="0.01"
                  required
                  placeholder="如 0.4"
                />
              </div>
            ) : null}
            {mode === "MANUAL" ? (
              <p className="text-xs text-muted-foreground md:col-span-2 -mt-1">
                每天固定占用该份额；其余容量由同日自动排班项目平分
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="notes">备注</Label>
              <Input id="notes" name="notes" />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            添加投入
          </Button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">人员</th>
              <th className="pb-2 pr-4">区间</th>
              <th className="pb-2 pr-4">模式</th>
              <th className="pb-2 pr-4">计算人天</th>
              <th className="pb-2 pr-4">日单价</th>
              <th className="pb-2 pr-4">分摊成本</th>
              {canEdit ? <th className="pb-2">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {allocations.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-3 pr-4">{row.userName}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  {formatLocalDateInput(new Date(row.startDate))} –{" "}
                  {formatLocalDateInput(new Date(row.endDate))}
                </td>
                <td className="py-3 pr-4">{ALLOCATION_MODE_LABELS[row.allocationMode]}</td>
                <td className="py-3 pr-4">
                  {row.effectiveDays}
                  {row.allocationMode === "AUTO" ? (
                    <span className="ml-1 text-xs text-muted-foreground">（自动）</span>
                  ) : null}
                </td>
                <td className="py-3 pr-4">{formatAmount(row.dailyRateSnapshot)}</td>
                <td className="py-3 pr-4">{formatAmount(row.cost)}</td>
                {canEdit ? (
                  <td className="py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteTarget(row)}
                    >
                      删除
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {allocations.length === 0 ? (
          <p className="py-6 text-muted-foreground">暂无人力投入记录。</p>
        ) : null}
      </div>

      <ConfirmDestructiveDialog
        open={Boolean(deleteTarget)}
        title="删除投入"
        message={
          deleteTarget
            ? `确定删除 ${deleteTarget.userName} 的投入记录？成本将实时重算。`
            : ""
        }
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
