"use client";

import { useMemo, useState, useTransition } from "react";
import { AllocationMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import {
  computeEffectiveDays,
  getPersonDailyLoad,
  serializeAllocationRecord,
  type AllocationRecord,
} from "@/lib/projects/allocation-split";
import { eachWorkday } from "@/lib/projects/workdays";
import type { ScheduleBar } from "@/lib/projects/schedule-serialize";
import {
  deleteProjectAllocation,
  updateProjectAllocation,
} from "@/app/(dashboard)/projects/allocation-actions";

type Props = {
  bar: ScheduleBar | null;
  projectId: string;
  canEdit: boolean;
  peerRecords: AllocationRecord[];
  onClose: () => void;
  onDeleted?: () => void;
};

export function AllocationEditDialog({
  bar,
  projectId,
  canEdit,
  peerRecords,
  onClose,
  onDeleted,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AllocationMode>(bar?.allocationMode ?? "AUTO");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const preview = useMemo(() => {
    if (!bar) return null;
    const record: AllocationRecord = {
      id: bar.id,
      projectId: bar.projectId,
      userId: bar.userId,
      startDate: new Date(bar.startDate),
      endDate: new Date(bar.endDate),
      allocationMode: mode,
      plannedDays: mode === "MANUAL" ? bar.plannedDays : null,
      splitWeight: null,
      dailyRateSnapshot: bar.dailyRateSnapshot,
    };
    const effectiveDays = computeEffectiveDays(record, peerRecords);
    const overloadDays = eachWorkday(record.startDate, record.endDate).filter((day) =>
      getPersonDailyLoad(bar.userId, day, peerRecords).overloaded
    ).length;
    return { effectiveDays, overloadDays };
  }, [bar, mode, peerRecords]);

  if (!bar) return null;

  function handleSave(formData: FormData) {
    setError(null);
    formData.set("allocationId", bar!.id);
    formData.set("projectId", projectId);
    formData.set("allocationMode", mode);
    startTransition(async () => {
      const result = await updateProjectAllocation(formData);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("allocationId", bar!.id);
    fd.set("projectId", projectId);
    startTransition(async () => {
      const result = await deleteProjectAllocation(fd);
      if (result.error) setError(result.error);
      else {
        setConfirmDelete(false);
        onDeleted?.();
        onClose();
      }
    });
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {bar.userName} · {bar.projectName}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave(new FormData(e.currentTarget));
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-startDate">开始日期</Label>
                <Input
                  id="edit-startDate"
                  name="startDate"
                  type="date"
                  required
                  disabled={!canEdit}
                  defaultValue={formatLocalDateInput(new Date(bar.startDate))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endDate">结束日期</Label>
                <Input
                  id="edit-endDate"
                  name="endDate"
                  type="date"
                  required
                  disabled={!canEdit}
                  defaultValue={formatLocalDateInput(new Date(bar.endDate))}
                />
              </div>
              <SelectField
                id="edit-allocationMode"
                name="allocationMode"
                label="模式"
                value={mode}
                disabled={!canEdit}
                onValueChange={(v) => setMode(v as AllocationMode)}
                options={(Object.keys(ALLOCATION_MODE_LABELS) as AllocationMode[]).map(
                  (key) => ({ value: key, label: ALLOCATION_MODE_LABELS[key] })
                )}
              />
              {mode === "MANUAL" ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-plannedDays">锁定总人天</Label>
                  <Input
                    id="edit-plannedDays"
                    name="plannedDays"
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    disabled={!canEdit}
                    defaultValue={bar.plannedDays ?? ""}
                  />
                </div>
              ) : null}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-notes">备注</Label>
                <Input
                  id="edit-notes"
                  name="notes"
                  disabled={!canEdit}
                  defaultValue={bar.notes ?? ""}
                />
              </div>
            </div>

            {preview ? (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p>
                  计算人天：<strong>{preview.effectiveDays}</strong>
                  {mode === "AUTO" ? "（随多项目自动拆分）" : ""}
                </p>
                {preview.overloadDays > 0 ? (
                  <p className="mt-1 text-destructive">
                    该区间内有 {preview.overloadDays} 个工作日 MANUAL 份额超过 100%
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {canEdit ? (
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setConfirmDelete(true)}
                >
                  删除
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    取消
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "保存中…" : "保存"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  关闭
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={confirmDelete}
        title="删除投入"
        message="确定删除该投入记录？成本将实时重算。"
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}
