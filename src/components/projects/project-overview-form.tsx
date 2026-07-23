"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { openEndDatePickerAfterStartChange } from "@/lib/dates/open-date-picker";
import {
  updateProjectOverview,
  updateProjectStatus,
} from "@/app/(dashboard)/projects/actions";
import {
  evaluateProjectSetup,
  getAllowedNextStatuses,
  type ProjectSetupCheck,
} from "@/lib/projects/project-setup-gate";

type Props = {
  projectId: string;
  canEdit: boolean;
  phaseCount: number;
  defaultValues: {
    status: ProjectStatus;
    progressPercent: number;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    actualStartAt: Date | null;
    actualEndAt: Date | null;
    notes: string | null;
  };
};

function formatDateOrDash(value: Date | null) {
  return value ? formatLocalDateInput(value) : "—";
}

export function ProjectOverviewForm({
  projectId,
  canEdit,
  phaseCount,
  defaultValues,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [status, setStatus] = useState(defaultValues.status);
  const [confirmStatus, setConfirmStatus] = useState<ProjectStatus | null>(null);

  const setup: ProjectSetupCheck = useMemo(
    () =>
      evaluateProjectSetup({
        plannedStartAt: defaultValues.plannedStartAt,
        plannedEndAt: defaultValues.plannedEndAt,
        phaseCount,
      }),
    [defaultValues.plannedStartAt, defaultValues.plannedEndAt, phaseCount]
  );

  const allowedNext = useMemo(
    () => getAllowedNextStatuses(status, setup.complete),
    [status, setup.complete]
  );

  const statusOptions = useMemo(() => {
    const values = [status, ...allowedNext.filter((s) => s !== status)];
    return values.map((value) => ({
      value,
      label: PROJECT_STATUS_LABELS[value],
    }));
  }, [status, allowedNext]);

  const statusLocked = status === "PENDING_START" && !setup.complete;

  if (!canEdit) {
    return (
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">状态</dt>
          <dd>{PROJECT_STATUS_LABELS[defaultValues.status]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">进度</dt>
          <dd>{defaultValues.progressPercent}%</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">计划开始</dt>
          <dd>{formatDateOrDash(defaultValues.plannedStartAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">计划结束</dt>
          <dd>{formatDateOrDash(defaultValues.plannedEndAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">实际开始</dt>
          <dd>{formatDateOrDash(defaultValues.actualStartAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">实际结束</dt>
          <dd>{formatDateOrDash(defaultValues.actualEndAt)}</dd>
        </div>
        {defaultValues.notes ? (
          <div className="md:col-span-2">
            <dt className="text-muted-foreground">备注</dt>
            <dd className="whitespace-pre-wrap">{defaultValues.notes}</dd>
          </div>
        ) : null}
      </dl>
    );
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("projectId", projectId);
    startTransition(async () => {
      const result = await updateProjectOverview(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleStatusSelect(next: string) {
    const nextStatus = next as ProjectStatus;
    setStatusError(null);
    if (nextStatus === status) return;
    setConfirmStatus(nextStatus);
  }

  function handleConfirmStatus() {
    if (!confirmStatus) return;
    setStatusError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("status", confirmStatus);
    startStatusTransition(async () => {
      const result = await updateProjectStatus(fd);
      if (result.error) {
        setStatusError(result.error);
        setConfirmStatus(null);
        return;
      }
      setStatus(confirmStatus);
      setConfirmStatus(null);
      router.refresh();
    });
  }

  return (
    <>
      {status === "PENDING_START" && !setup.complete ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">完成基础设置后才可启动项目</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {setup.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {!setup.hasPlannedStart || !setup.hasPlannedEnd ? (
            <p className="mt-1 text-xs">请先填写并保存计划起止日期。</p>
          ) : null}
          {setup.phaseCount < 1 ? (
            <p className="mt-1 text-xs">
              请到「项目计划」页签至少新增一个项目阶段。
            </p>
          ) : null}
        </div>
      ) : null}

      <form action={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <SelectField
              id="status"
              name="statusDisplay"
              label="状态"
              value={status}
              onValueChange={handleStatusSelect}
              options={statusOptions}
              disabled={statusLocked || statusPending}
            />
            {statusLocked && status === "PENDING_START" ? (
              <p className="text-xs text-muted-foreground">
                基础设置未完成，暂不可变更状态
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                可调整为任意其他状态；变更需二次确认
              </p>
            )}
            {statusError ? (
              <p className="text-xs text-destructive">{statusError}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="progressPercent">进度 %</Label>
            <Input
              id="progressPercent"
              type="number"
              value={defaultValues.progressPercent}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              由各阶段权重与完成度自动汇总，不可手工修改
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plannedStartAt">计划开始</Label>
            <Input
              id="plannedStartAt"
              name="plannedStartAt"
              type="date"
              defaultValue={
                defaultValues.plannedStartAt
                  ? formatLocalDateInput(defaultValues.plannedStartAt)
                  : ""
              }
              onChange={() => openEndDatePickerAfterStartChange("plannedEndAt")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plannedEndAt">计划结束</Label>
            <Input
              id="plannedEndAt"
              name="plannedEndAt"
              type="date"
              defaultValue={
                defaultValues.plannedEndAt
                  ? formatLocalDateInput(defaultValues.plannedEndAt)
                  : ""
              }
            />
          </div>
          <div className="space-y-2">
            <Label>实际开始</Label>
            <Input
              value={
                defaultValues.actualStartAt
                  ? formatLocalDateInput(defaultValues.actualStartAt)
                  : ""
              }
              placeholder="首次分配人力后自动记录"
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              首次分配人力资源时自动记录，不可手动修改
            </p>
          </div>
          <div className="space-y-2">
            <Label>实际结束</Label>
            <Input
              value={
                defaultValues.actualEndAt
                  ? formatLocalDateInput(defaultValues.actualEndAt)
                  : ""
              }
              placeholder="状态置为已关闭时自动记录"
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              状态置为「已关闭」时自动记录，不可手动修改
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">备注</Label>
          <Input id="notes" name="notes" defaultValue={defaultValues.notes ?? ""} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存概览"}
        </Button>
      </form>

      <ConfirmDestructiveDialog
        open={confirmStatus != null}
        title="确认变更项目状态"
        message={
          confirmStatus
            ? `确定将状态从「${PROJECT_STATUS_LABELS[status]}」变更为「${PROJECT_STATUS_LABELS[confirmStatus]}」吗？${
                confirmStatus === "CLOSED"
                  ? "关闭后将自动记录实际结束日期。"
                  : status === "CLOSED"
                    ? "重新打开后将清空实际结束日期。"
                    : ""
              }`
            : ""
        }
        confirmLabel="确认变更"
        variant={confirmStatus === "CLOSED" ? "destructive" : "default"}
        pending={statusPending}
        onCancel={() => setConfirmStatus(null)}
        onConfirm={handleConfirmStatus}
      />
    </>
  );
}
