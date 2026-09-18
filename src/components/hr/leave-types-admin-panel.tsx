"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveLeaveTypeAction } from "@/app/(dashboard)/hr/leave-types/actions";

type LeaveTypeRow = {
  id: string;
  key: string;
  label: string;
  payFactor: number;
  countsAsAbsence: boolean;
  exemptDailyReport: boolean;
  enabled: boolean;
  sortOrder: number;
};

type Props = { types: LeaveTypeRow[] };

function LeaveTypeForm({
  initial,
  onDone,
}: {
  initial?: LeaveTypeRow;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  return (
    <form
      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await saveLeaveTypeAction(fd);
          if (res.error) {
            alert(res.error);
            return;
          }
          onDone();
        });
      }}
    >
      {isEdit ? <input type="hidden" name="id" value={initial!.id} /> : null}
      <div className="space-y-1">
        <Label htmlFor={`label-${initial?.id ?? "new"}`}>名称</Label>
        <Input
          id={`label-${initial?.id ?? "new"}`}
          name="label"
          required
          defaultValue={initial?.label ?? ""}
          placeholder="如：产假"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`key-${initial?.id ?? "new"}`}>编码</Label>
        <Input
          id={`key-${initial?.id ?? "new"}`}
          name="key"
          defaultValue={initial?.key ?? ""}
          placeholder="英文，如 maternity"
          disabled={isEdit}
          required={!isEdit}
        />
        {isEdit ? (
          <p className="text-xs text-muted-foreground">编码创建后不可改</p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`pay-${initial?.id ?? "new"}`}>计薪系数（0～1）</Label>
        <Input
          id={`pay-${initial?.id ?? "new"}`}
          name="payFactor"
          type="number"
          min={0}
          max={1}
          step={0.05}
          required
          defaultValue={initial?.payFactor ?? 0}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`sort-${initial?.id ?? "new"}`}>排序</Label>
        <Input
          id={`sort-${initial?.id ?? "new"}`}
          name="sortOrder"
          type="number"
          step={1}
          defaultValue={initial?.sortOrder ?? 100}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="countsAsAbsence"
          defaultChecked={initial?.countsAsAbsence ?? true}
        />
        计为缺勤（减少实际出勤天数）
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="exemptDailyReport"
          defaultChecked={initial?.exemptDailyReport ?? true}
        />
        免交日报
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial?.enabled ?? true}
        />
        启用（关闭后登记请假时不可选）
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} size="sm">
          {isEdit ? "保存修改" : "新增假种"}
        </Button>
      </div>
    </form>
  );
}

export function LeaveTypesAdminPanel({ types }: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">已有假种</p>
        {types.map((t) => (
          <div key={t.id} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t.key}
              {!t.enabled ? " · 已停用" : ""}
              {" · "}
              计薪 {(t.payFactor * 100).toFixed(0)}%
            </p>
            <LeaveTypeForm initial={t} onDone={refresh} />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">新增假种</p>
        <LeaveTypeForm onDone={refresh} />
      </div>
    </div>
  );
}
