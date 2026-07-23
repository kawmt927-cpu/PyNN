"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProjectModelGanttEditor,
  collectProjectModelGanttBlockers,
  hasProjectModelGanttBlockers,
  type EditableModelPhase,
  type EditableModelNode,
} from "@/components/admin/project-model-gantt-editor";
import {
  deleteProjectModel,
  saveProjectModelPhases,
  updateProjectModel,
} from "@/app/(dashboard)/admin/settings/project-model-actions";
import {
  PROJECT_MODELS_LIST_HREF,
  type ProjectModelDetail,
} from "@/components/admin/project-model-types";
import { cn } from "@/lib/utils";

function toEditablePhases(model: ProjectModelDetail): EditableModelPhase[] {
  return model.phases.map((phase) => ({
    key: phase.id,
    id: phase.id,
    name: phase.name,
    sortOrder: phase.sortOrder,
    progressWeight: phase.progressWeight,
    startRef: phase.startRef,
    startOffset: phase.startOffset,
    endRef: phase.endRef,
    endOffset: phase.endOffset,
    durationDays: phase.durationDays,
    tasks: phase.tasks.map((task) => ({
      key: task.id,
      id: task.id,
      name: task.name,
      sortOrder: task.sortOrder,
      durationDays: task.durationDays,
    })),
  }));
}

function toEditableNodes(model: ProjectModelDetail): EditableModelNode[] {
  return model.nodes.map((node) => ({
    key: node.id,
    id: node.id,
    name: node.name,
    sortOrder: node.sortOrder,
    timeRef: node.timeRef,
    timeOffset: node.timeOffset,
  }));
}

function buildEditorSnapshot(input: {
  modelName: string;
  description: string;
  enabled: boolean;
  totalDurationDays: number;
  phases: EditableModelPhase[];
  nodes: EditableModelNode[];
}): string {
  const phases = [...input.phases]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map((phase) => ({
      id: phase.id ?? null,
      key: phase.key,
      name: phase.name.trim(),
      sortOrder: phase.sortOrder,
      startRef: phase.startRef,
      startOffset: phase.startOffset,
      endRef: phase.endRef,
      endOffset: phase.endOffset,
      durationDays: phase.durationDays,
      tasks: [...phase.tasks]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
        .map((task) => ({
          id: task.id ?? null,
          key: task.key,
          name: task.name.trim(),
          sortOrder: task.sortOrder,
          durationDays: task.durationDays,
        })),
    }));

  const nodes = [...input.nodes]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map((node) => ({
      id: node.id ?? null,
      key: node.key,
      name: node.name.trim(),
      sortOrder: node.sortOrder,
      timeRef: node.timeRef,
      timeOffset: node.timeOffset,
    }));

  return JSON.stringify({
    modelName: input.modelName.trim(),
    description: input.description.trim(),
    enabled: input.enabled,
    totalDurationDays: input.totalDurationDays,
    phases,
    nodes,
  });
}

export function ProjectModelEditor({ model }: { model: ProjectModelDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [modelName, setModelName] = useState(model.name);
  const [description, setDescription] = useState(model.description ?? "");
  const [enabled, setEnabled] = useState(model.enabled);
  const [totalDurationDays, setTotalDurationDays] = useState(model.totalDurationDays);
  const [savedPhases, setSavedPhases] = useState(() => toEditablePhases(model));
  const [savedNodes, setSavedNodes] = useState(() => toEditableNodes(model));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const phaseSignature = useMemo(
    () =>
      [
        model.name,
        model.description,
        model.enabled,
        model.totalDurationDays,
        ...model.phases.map(
          (p) =>
            `${p.id}:${p.startRef}:${p.startOffset}:${p.endRef}:${p.endOffset}:${p.durationDays}:${p.tasks.map((t) => `${t.id}:${t.durationDays}`).join(",")}`
        ),
        ...model.nodes.map((n) => `${n.id}:${n.timeRef}:${n.timeOffset}`),
      ].join("|"),
    [model]
  );

  useEffect(() => {
    setModelName(model.name);
    setDescription(model.description ?? "");
    setEnabled(model.enabled);
    setTotalDurationDays(model.totalDurationDays);
    setSavedPhases(toEditablePhases(model));
    setSavedNodes(toEditableNodes(model));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseSignature, model.id]);

  const hasGanttBlockers = useMemo(
    () => hasProjectModelGanttBlockers(savedPhases, savedNodes, totalDurationDays),
    [savedPhases, savedNodes, totalDurationDays]
  );

  const ganttBlockerMessages = useMemo(
    () => collectProjectModelGanttBlockers(savedPhases, savedNodes, totalDurationDays),
    [savedPhases, savedNodes, totalDurationDays]
  );

  const baselineSnapshot = useMemo(
    () =>
      buildEditorSnapshot({
        modelName: model.name,
        description: model.description ?? "",
        enabled: model.enabled,
        totalDurationDays: model.totalDurationDays,
        phases: toEditablePhases(model),
        nodes: toEditableNodes(model),
      }),
    [phaseSignature, model]
  );

  const isDirty = useMemo(
    () =>
      buildEditorSnapshot({
        modelName,
        description,
        enabled,
        totalDurationDays,
        phases: savedPhases,
        nodes: savedNodes,
      }) !== baselineSnapshot,
    [
      baselineSnapshot,
      modelName,
      description,
      enabled,
      totalDurationDays,
      savedPhases,
      savedNodes,
    ]
  );

  function persistAll() {
    setError(null);
    setHint(null);
    const blockers = collectProjectModelGanttBlockers(
      savedPhases,
      savedNodes,
      totalDurationDays
    );
    if (blockers.length > 0 || !modelName.trim()) {
      setError(
        !modelName.trim()
          ? "请填写模型名称后再保存"
          : blockers.length === 1
            ? blockers[0]
            : blockers.join("；")
      );
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", model.id);
      formData.set("name", modelName.trim());
      formData.set("description", description.trim());
      if (enabled) formData.set("enabled", "on");
      formData.set("totalDurationDays", String(totalDurationDays));

      const metaResult = await updateProjectModel(formData);
      if (metaResult.error) {
        setError(metaResult.error);
        return;
      }

      const result = await saveProjectModelPhases({
        modelId: model.id,
        totalDurationDays,
        phases: savedPhases.map((phase) => ({
          id: phase.id,
          key: phase.key,
          name: phase.name,
          sortOrder: phase.sortOrder,
          startRef: phase.startRef,
          startOffset: phase.startOffset,
          endRef: phase.endRef,
          endOffset: phase.endOffset,
          durationDays: phase.durationDays,
          tasks: phase.tasks.map((task) => ({
            id: task.id,
            key: task.key,
            name: task.name,
            sortOrder: task.sortOrder,
            durationDays: task.durationDays,
          })),
        })),
        nodes: savedNodes.map((node) => ({
          id: node.id,
          key: node.key,
          name: node.name,
          sortOrder: node.sortOrder,
          timeRef: node.timeRef,
          timeOffset: node.timeOffset,
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      const notes: string[] = ["已保存"];
      if (result.layoutErrors?.length) {
        notes.push(...result.layoutErrors);
      }
      setHint(notes.join("；"));
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold leading-none tracking-tight">项目模型</h3>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={PROJECT_MODELS_LIST_HREF}>← 返回</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
          >
            删除
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={pending || hasGanttBlockers || !modelName.trim() || !isDirty}
            onClick={persistAll}
          >
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/10 px-3 py-2">
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <Label htmlFor="model-name" className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
            模型名称
          </Label>
          <Input
            id="model-name"
            value={modelName}
            required
            disabled={pending}
            className="h-8"
            onChange={(e) => setModelName(e.target.value)}
          />
        </div>

        <div className="flex min-w-[180px] flex-[2] items-center gap-2">
          <Label htmlFor="model-desc" className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
            说明
          </Label>
          <Input
            id="model-desc"
            value={description}
            disabled={pending}
            className="h-8"
            placeholder="可选"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="model-duration" className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
            总工期
          </Label>
          <Input
            id="model-duration"
            type="number"
            min={1}
            value={totalDurationDays}
            disabled={pending}
            className={cn("h-8 w-20", hasGanttBlockers && "border-destructive")}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (Number.isFinite(parsed) && parsed >= 1) {
                setTotalDurationDays(Math.floor(parsed));
              }
            }}
          />
          <span className="shrink-0 text-xs text-muted-foreground">自然日</span>
        </div>

        <label className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用
        </label>
      </div>

      {ganttBlockerMessages.length > 0 ? (
        <ul className="shrink-0 space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {ganttBlockerMessages.map((message) => (
            <li key={message}>• {message}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-destructive shrink-0">{error}</p> : null}
      {hint && !error ? <p className="text-sm text-muted-foreground shrink-0">{hint}</p> : null}

      <ProjectModelGanttEditor
        totalDurationDays={totalDurationDays}
        savedPhases={savedPhases}
        onSavedPhasesChange={setSavedPhases}
        savedNodes={savedNodes}
        onSavedNodesChange={setSavedNodes}
        disabled={pending}
      />

      <ConfirmDestructiveDialog
        open={confirmDelete}
        title="删除项目模型"
        message={`确定删除模型「${modelName.trim() || model.name}」？此操作不可撤销。`}
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await deleteProjectModel(model.id);
            if (result.error) {
              setError(result.error);
              setConfirmDelete(false);
            } else {
              router.push(PROJECT_MODELS_LIST_HREF);
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}
