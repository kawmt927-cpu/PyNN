"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhaseStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { PHASE_STATUS_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import {
  applyProjectModelToProject,
  createProjectPhase,
  deleteProjectPhase,
  updateProjectPhase,
} from "@/app/(dashboard)/projects/actions";

const STATUS_OPTIONS = (Object.keys(PHASE_STATUS_LABELS) as PhaseStatus[]).map(
  (status) => ({
    value: status,
    label: PHASE_STATUS_LABELS[status],
  })
);

export type PhaseListItem = {
  id: string;
  name: string;
  sortOrder: number;
  parallelGroup: number | null;
  progressWeight: number;
  status: PhaseStatus;
  plannedAt: Date | null;
  completedAt: Date | null;
  sourceProduct: string | null;
};

export type ProjectModelOption = {
  id: string;
  name: string;
  phaseCount: number;
};

type Props = {
  projectId: string;
  phases: PhaseListItem[];
  canEdit: boolean;
  projectModels?: ProjectModelOption[];
  hasPlannedStart?: boolean;
};

export function PhaseListPanel({
  projectId,
  phases,
  canEdit,
  projectModels = [],
  hasPlannedStart = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [applyModelId, setApplyModelId] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);

  const nextSortOrder =
    phases.length === 0 ? 0 : Math.max(...phases.map((p) => p.sortOrder)) + 1;

  const selectedModel = projectModels.find((m) => m.id === applyModelId);

  function runAction(action: (fd: FormData) => Promise<{ error?: string }>, fd: FormData) {
    setError(null);
    fd.set("projectId", projectId);
    startTransition(async () => {
      const result = await action(fd);
      if (result.error) setError(result.error);
      else {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function handleApplyModel() {
    if (!applyModelId) return;
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("modelId", applyModelId);
    startTransition(async () => {
      const result = await applyProjectModelToProject(fd);
      setConfirmApply(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setApplyModelId("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {canEdit && projectModels.length > 0 ? (
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">从项目模型套用</p>
          <p className="text-xs text-muted-foreground">
            将替换当前全部阶段
            {hasPlannedStart
              ? "，并按计划开始日与模型工期预填各阶段计划完成日。"
              : "。项目尚未设置计划开始，套用后仅生成阶段列表，不预填计划完成日。"}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-2">
              <SelectField
                id="apply-model"
                name="modelId"
                label="项目模型"
                value={applyModelId || "__none__"}
                onValueChange={(v) => setApplyModelId(v === "__none__" ? "" : v)}
                options={[
                  { value: "__none__", label: "请选择模型" },
                  ...projectModels.map((model) => ({
                    value: model.id,
                    label: `${model.name}（${model.phaseCount} 阶段）`,
                  })),
                ]}
              />
            </div>
            <Button
              type="button"
              disabled={pending || !applyModelId}
              onClick={() => setConfirmApply(true)}
            >
              套用模型
            </Button>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <form
          action={(fd) => runAction(createProjectPhase, fd)}
          className="rounded-md border p-4 space-y-3"
        >
          <p className="text-sm font-medium">新增阶段</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">名称</Label>
              <Input id="new-name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-sortOrder">排序</Label>
              <Input
                id="new-sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={nextSortOrder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-plannedAt">计划完成</Label>
              <Input id="new-plannedAt" name="plannedAt" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-status">状态</Label>
              <SelectField
                id="new-status"
                name="status"
                label=""
                defaultValue="NOT_STARTED"
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            添加阶段
          </Button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">排序</th>
              <th className="pb-2 pr-4">名称</th>
              <th className="pb-2 pr-4">并行组</th>
              <th className="pb-2 pr-4">进度%</th>
              <th className="pb-2 pr-4">状态</th>
              <th className="pb-2 pr-4">计划完成</th>
              <th className="pb-2 pr-4">实际完成</th>
              {canEdit ? <th className="pb-2">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {phases.map((phase) =>
              editingId === phase.id && canEdit ? (
                <tr key={phase.id} className="border-b">
                  <td colSpan={canEdit ? 8 : 7} className="py-3">
                    <form
                      action={(fd) => {
                        fd.set("phaseId", phase.id);
                        runAction(updateProjectPhase, fd);
                      }}
                      className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
                    >
                      <Input name="name" defaultValue={phase.name} required />
                      <Input name="sortOrder" type="number" defaultValue={phase.sortOrder} />
                      <Input
                        name="parallelGroup"
                        type="number"
                        placeholder="并行组"
                        defaultValue={phase.parallelGroup ?? ""}
                      />
                      <SelectField
                        id={`edit-status-${phase.id}`}
                        name="status"
                        label=""
                        defaultValue={phase.status}
                        options={STATUS_OPTIONS}
                      />
                      <Input
                        name="plannedAt"
                        type="date"
                        defaultValue={
                          phase.plannedAt ? formatLocalDateInput(phase.plannedAt) : ""
                        }
                      />
                      <Input
                        name="completedAt"
                        type="date"
                        defaultValue={
                          phase.completedAt
                            ? formatLocalDateInput(phase.completedAt)
                            : ""
                        }
                      />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={pending}>
                          保存
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={phase.id} className="border-b">
                  <td className="py-3 pr-4">{phase.sortOrder}</td>
                  <td className="py-3 pr-4">{phase.name}</td>
                  <td className="py-3 pr-4">{phase.parallelGroup ?? "—"}</td>
                  <td className="py-3 pr-4">{phase.progressWeight}</td>
                  <td className="py-3 pr-4">{PHASE_STATUS_LABELS[phase.status]}</td>
                  <td className="py-3 pr-4">
                    {phase.plannedAt
                      ? new Date(phase.plannedAt).toLocaleDateString("zh-CN")
                      : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {phase.completedAt
                      ? new Date(phase.completedAt).toLocaleDateString("zh-CN")
                      : "—"}
                  </td>
                  {canEdit ? (
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(phase.id)}
                        >
                          编辑
                        </Button>
                        <DeletePhaseButton
                          phaseName={phase.name}
                          pending={pending}
                          onDelete={() => {
                            const fd = new FormData();
                            fd.set("phaseId", phase.id);
                            fd.set("projectId", projectId);
                            runAction(deleteProjectPhase, fd);
                          }}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              )
            )}
          </tbody>
        </table>
        {phases.length === 0 ? (
          <p className="py-6 text-muted-foreground">暂无阶段。</p>
        ) : null}
      </div>

      <ConfirmDestructiveDialog
        open={confirmApply}
        title="套用项目模型"
        message={
          selectedModel
            ? `确定用「${selectedModel.name}」替换当前全部阶段吗？现有阶段将被删除。`
            : ""
        }
        confirmLabel="确认套用"
        variant="destructive"
        pending={pending}
        onCancel={() => setConfirmApply(false)}
        onConfirm={handleApplyModel}
      />
    </div>
  );
}

function DeletePhaseButton({
  phaseName,
  pending,
  onDelete,
}: {
  phaseName: string;
  pending: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="destructive" onClick={() => setOpen(true)}>
        删除
      </Button>
      <ConfirmDestructiveDialog
        open={open}
        title="删除阶段"
        message={`确定删除阶段「${phaseName}」？此操作不可撤销。`}
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          onDelete();
          setOpen(false);
        }}
      />
    </>
  );
}
