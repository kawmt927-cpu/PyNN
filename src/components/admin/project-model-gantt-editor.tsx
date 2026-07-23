"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToneSelect, type SelectFieldOptionTone } from "@/components/ui/select-field";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { cn } from "@/lib/utils";
import {
  DURATION_REF,
  layoutProjectModelTimeline,
  nodeRef,
  phaseEndRef,
  phaseStartRef,
  PROJECT_END_REF,
  PROJECT_START_REF,
  collectProjectModelNameErrors,
  type ProjectModelNodeInput,
  type ProjectModelPhaseInput,
} from "@/lib/projects/project-model-timeline";

const MIN_DAY_WIDTH = 16;
const GANTT_LABEL_WIDTH = 120;

function ganttLeftPct(day: number, totalDays: number) {
  if (totalDays <= 0) return "0%";
  return `${((day - 1) / totalDays) * 100}%`;
}

function milestoneTimeAnchor(timeRef: string): "start" | "end" {
  if (timeRef === PROJECT_END_REF || timeRef.startsWith("PHASE_END:")) {
    return "end";
  }
  return "start";
}

function ganttMilestoneLeftPct(day: number, totalDays: number, anchor: "start" | "end") {
  if (totalDays <= 0) return "0%";
  if (anchor === "end") {
    return `${(day / totalDays) * 100}%`;
  }
  return `${((day - 1) / totalDays) * 100}%`;
}

function ganttWidthPct(days: number, totalDays: number) {
  if (totalDays <= 0) return "0%";
  return `${(days / totalDays) * 100}%`;
}

export type EditableModelTask = {
  key: string;
  id?: string;
  name: string;
  sortOrder: number;
  durationDays: number;
};

export type EditableModelPhase = ProjectModelPhaseInput & {
  tasks: EditableModelTask[];
};
export type EditableModelNode = ProjectModelNodeInput;

type ModelSelection =
  | { kind: "phase"; key: string }
  | { kind: "phase-tasks"; phaseKey: string }
  | { kind: "node"; key: string };

type Props = {
  totalDurationDays: number;
  savedPhases: EditableModelPhase[];
  onSavedPhasesChange: (phases: EditableModelPhase[]) => void;
  savedNodes: EditableModelNode[];
  onSavedNodesChange: (nodes: EditableModelNode[]) => void;
  disabled?: boolean;
};

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nextDefaultSequencedName(baseName: string, existingNames: string[]): string {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?: (\\d+))?$`);
  let maxSlot = 0;
  for (const name of existingNames) {
    const match = name.trim().match(pattern);
    if (!match) continue;
    const slot = match[1] ? Number.parseInt(match[1], 10) : 1;
    maxSlot = Math.max(maxSlot, slot);
  }
  if (maxSlot === 0) return baseName;
  return `${baseName} ${maxSlot + 1}`;
}

function createBlankPhase(
  sortOrder: number,
  name = "新阶段",
  previousPhaseKey?: string
): EditableModelPhase {
  return {
    key: newKey("phase"),
    name,
    sortOrder,
    startRef: previousPhaseKey ? phaseEndRef(previousPhaseKey) : PROJECT_START_REF,
    startOffset: previousPhaseKey ? 1 : 0,
    endRef: DURATION_REF,
    endOffset: 0,
    durationDays: 30,
    tasks: [],
  };
}

function createBlankTask(sortOrder: number): EditableModelTask {
  return {
    key: newKey("task"),
    name: "新任务",
    sortOrder,
    durationDays: 1,
  };
}

function createBlankNode(sortOrder: number, name = "新节点"): EditableModelNode {
  return {
    key: newKey("node"),
    name,
    sortOrder,
    timeRef: PROJECT_START_REF,
    timeOffset: 0,
  };
}

function sortPhases(phases: EditableModelPhase[]) {
  return [...phases].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN")
  );
}

function sortTasks(tasks: EditableModelTask[]) {
  return [...tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN")
  );
}

function parseTimeRef(ref: string): { primary: string; edge: "start" | "end" } {
  if (ref === PROJECT_START_REF) return { primary: PROJECT_START_REF, edge: "start" };
  if (ref === PROJECT_END_REF) return { primary: PROJECT_END_REF, edge: "end" };
  if (ref === DURATION_REF) return { primary: DURATION_REF, edge: "start" };
  if (ref.startsWith("NODE:")) return { primary: ref, edge: "start" };
  const match = ref.match(/^PHASE_(START|END):(.+)$/);
  if (match) {
    return {
      primary: `PHASE:${match[2]}`,
      edge: match[1] === "END" ? "end" : "start",
    };
  }
  return { primary: PROJECT_START_REF, edge: "start" };
}

function buildTimeRef(primary: string, edge: "start" | "end"): string {
  if (
    primary === PROJECT_START_REF ||
    primary === PROJECT_END_REF ||
    primary === DURATION_REF ||
    primary.startsWith("NODE:")
  ) {
    return primary;
  }
  if (primary.startsWith("PHASE:")) {
    const key = primary.slice("PHASE:".length);
    return edge === "end" ? phaseEndRef(key) : phaseStartRef(key);
  }
  return PROJECT_START_REF;
}

function buildPrimaryRefOptions(
  selfKey: string,
  allPhases: EditableModelPhase[],
  allNodes: EditableModelNode[],
  includeDuration: boolean
): Array<{ value: string; label: string; tone?: SelectFieldOptionTone }> {
  const options: Array<{ value: string; label: string; tone?: SelectFieldOptionTone }> = [];
  if (includeDuration) {
    options.push({ value: DURATION_REF, label: "固定工期", tone: "duration" });
  }
  options.push({ value: PROJECT_START_REF, label: "项目开始时间", tone: "project-start" });
  for (const p of [...allPhases]
    .filter((row) => row.key !== selfKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"))) {
    options.push({ value: `PHASE:${p.key}`, label: p.name, tone: "phase" });
  }
  for (const n of [...allNodes]
    .filter((row) => row.key !== selfKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"))) {
    options.push({ value: nodeRef(n.key), label: n.name, tone: "milestone" });
  }
  options.push({ value: PROJECT_END_REF, label: "项目结束时间", tone: "project-end" });
  return options;
}

function sanitizeTimeRef(
  ref: string,
  selfKey: string,
  allPhases: EditableModelPhase[],
  allNodes: EditableModelNode[],
  fallback: string
) {
  if (ref === PROJECT_START_REF || ref === PROJECT_END_REF || ref === DURATION_REF) return ref;
  const nodeMatch = ref.match(/^NODE:(.+)$/);
  if (nodeMatch) {
    const key = nodeMatch[1];
    if (key === selfKey || !allNodes.some((n) => n.key === key)) return fallback;
    return ref;
  }
  const phaseMatch = ref.match(/^PHASE_(START|END):(.+)$/);
  if (!phaseMatch) return fallback;
  const key = phaseMatch[2];
  if (key === selfKey || !allPhases.some((p) => p.key === key)) return fallback;
  return ref;
}

function TimeRefPicker({
  id,
  name,
  label,
  value,
  selfKey,
  allPhases,
  allNodes,
  includeDuration,
  disabled,
  compact,
  onChange,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  selfKey: string;
  allPhases: EditableModelPhase[];
  allNodes: EditableModelNode[];
  includeDuration: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (ref: string) => void;
}) {
  const parsed = parseTimeRef(value);
  const primaryOptions = buildPrimaryRefOptions(selfKey, allPhases, allNodes, includeDuration);
  const isPhaseRef = parsed.primary.startsWith("PHASE:");

  function handlePrimaryChange(primary: string) {
    if (
      primary === PROJECT_START_REF ||
      primary === PROJECT_END_REF ||
      primary === DURATION_REF ||
      primary.startsWith("NODE:")
    ) {
      onChange(primary);
      return;
    }
    onChange(buildTimeRef(primary, parsed.edge));
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <ToneSelect
        id={id}
        name={name}
        value={parsed.primary}
        disabled={disabled}
        options={primaryOptions}
        size={compact ? "sm" : "default"}
        onValueChange={handlePrimaryChange}
      />
      {isPhaseRef ? (
        <div className={compact ? "space-y-1" : "space-y-2"}>
          <Label htmlFor={`${id}-edge`} className="text-xs">
            参照节点
          </Label>
          <ToneSelect
            id={`${id}-edge`}
            value={parsed.edge}
            disabled={disabled}
            options={[
              { value: "start", label: "阶段开始时" },
              { value: "end", label: "阶段结束时" },
            ]}
            size={compact ? "sm" : "default"}
            onValueChange={(edge) =>
              onChange(buildTimeRef(parsed.primary, edge as "start" | "end"))
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function PhaseOffsetField({
  id,
  value,
  disabled,
  mode,
  onChange,
}: {
  id?: string;
  value: number;
  disabled?: boolean;
  mode: "signed" | "duration";
  onChange: (value: number) => void;
}) {
  const [direction, setDirection] = useState<"after" | "before">(value >= 0 ? "after" : "before");
  const [text, setText] = useState(String(mode === "duration" ? Math.max(1, Math.abs(value)) : Math.abs(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      if (value < 0) setDirection("before");
      else if (value > 0) setDirection("after");
      setText(String(mode === "duration" ? Math.max(1, Math.abs(value)) : Math.abs(value)));
    }
  }, [value, focused, mode]);

  function parseMagnitude(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits === "") return mode === "duration" ? 1 : 0;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return mode === "duration" ? 1 : 0;
    return mode === "duration" ? Math.max(1, Math.floor(parsed)) : Math.floor(parsed);
  }

  function emit(nextDirection: "after" | "before", raw: string) {
    const mag = parseMagnitude(raw);
    setText(String(mag));
    if (mode === "duration") {
      onChange(mag);
      return;
    }
    onChange(nextDirection === "after" ? mag : -mag);
  }

  function commit(raw: string) {
    emit(direction, raw);
  }

  function toggleDirection() {
    if (mode !== "signed" || disabled) return;
    const nextDirection = direction === "after" ? "before" : "after";
    setDirection(nextDirection);
    emit(nextDirection, text);
  }

  function handleInputChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    setText(digits);
    if (digits === "") return;
    emit(direction, digits);
  }

  return (
    <div className="flex items-center gap-1">
      {mode === "signed" ? (
        <div className="group/direction relative shrink-0">
          <button
            type="button"
            title="点击切换前/后"
            disabled={disabled}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50",
              direction === "after"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/60 hover:bg-emerald-500/20 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                : "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
            )}
            onClick={toggleDirection}
          >
            {direction === "after" ? "后" : "前"}
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow-md transition-opacity group-hover/direction:opacity-100"
          >
            点击切换前/后
          </span>
        </div>
      ) : null}
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        disabled={disabled}
        className="h-8 w-14 px-2 text-center"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit(text === "" ? "0" : text);
        }}
        onKeyDown={(e) => {
          if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E" || e.key === ".") {
            e.preventDefault();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData("text").replace(/[^\d]/g, "");
          handleInputChange(pasted);
        }}
        onChange={(e) => handleInputChange(e.target.value)}
      />
      <span className="shrink-0 text-xs text-muted-foreground">自然日</span>
    </div>
  );
}

function PhaseTimeRefRow({
  idPrefix,
  refValue,
  selfKey,
  allPhases,
  allNodes,
  includeDuration,
  disabled,
  offsetValue,
  offsetMode,
  onRefChange,
  onOffsetChange,
}: {
  idPrefix: string;
  refValue: string;
  selfKey: string;
  allPhases: EditableModelPhase[];
  allNodes: EditableModelNode[];
  includeDuration: boolean;
  disabled?: boolean;
  offsetValue: number;
  offsetMode: "signed" | "duration";
  onRefChange: (ref: string) => void;
  onOffsetChange: (value: number) => void;
}) {
  const parsed = parseTimeRef(refValue);
  const primaryOptions = buildPrimaryRefOptions(selfKey, allPhases, allNodes, includeDuration);
  const isPhaseRef = parsed.primary.startsWith("PHASE:");
  const isDurationRef = parsed.primary === DURATION_REF;

  function handlePrimaryChange(primary: string) {
    if (
      primary === PROJECT_START_REF ||
      primary === PROJECT_END_REF ||
      primary === DURATION_REF ||
      primary.startsWith("NODE:")
    ) {
      onRefChange(primary);
      return;
    }
    onRefChange(buildTimeRef(primary, parsed.edge));
  }

  return (
    <div
      className={cn(
        "grid items-center gap-2",
        isDurationRef
          ? "grid-cols-[minmax(0,1fr)_auto]"
          : "grid-cols-[minmax(0,1.2fr)_minmax(120px,160px)_auto]"
      )}
    >
      <div className="min-w-0">
        <ToneSelect
          id={`${idPrefix}-ref`}
          value={parsed.primary}
          disabled={disabled}
          options={primaryOptions}
          size="sm"
          onValueChange={handlePrimaryChange}
        />
      </div>
      {!isDurationRef ? (
        <div className="min-w-0">
          {isPhaseRef ? (
            <ToneSelect
              id={`${idPrefix}-edge`}
              value={parsed.edge}
              disabled={disabled}
              options={[
                { value: "start", label: "阶段开始时" },
                { value: "end", label: "阶段结束时" },
              ]}
              size="sm"
              onValueChange={(edge) =>
                onRefChange(buildTimeRef(parsed.primary, edge as "start" | "end"))
              }
            />
          ) : (
            <div
              className="flex h-8 w-full max-w-[160px] items-center rounded-md border border-dashed border-muted-foreground/20 px-2 text-xs text-muted-foreground/40"
              aria-hidden
            >
              —
            </div>
          )}
        </div>
      ) : null}
      <PhaseOffsetField
        id={`${idPrefix}-offset`}
        value={offsetValue}
        disabled={disabled}
        mode={offsetMode}
        onChange={onOffsetChange}
      />
    </div>
  );
}

function DraftNumberInput({
  value,
  min,
  max,
  fallback,
  allowNegative,
  disabled,
  className,
  id,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  fallback?: number;
  allowNegative?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  function normalize(raw: string) {
    const parsed = Number(raw);
    let next = Number.isFinite(parsed) ? Math.floor(parsed) : (fallback ?? min ?? 0);
    if (min != null && !allowNegative) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    return next;
  }

  function commit(raw: string) {
    const next = normalize(raw);
    setText(String(next));
    onChange(next);
  }

  return (
    <Input
      id={id}
      type="number"
      min={allowNegative ? undefined : min}
      max={max}
      value={text}
      disabled={disabled}
      className={className}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "" || raw === "-") return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        onChange(normalize(raw));
      }}
    />
  );
}

function GanttMilestoneLine({
  day,
  name,
  totalDays,
  timeRef,
}: {
  day: number;
  name: string;
  totalDays: number;
  timeRef: string;
}) {
  const anchor = milestoneTimeAnchor(timeRef);
  const lineLeft = ganttMilestoneLeftPct(day, totalDays, anchor);

  return (
    <>
      <div
        className="absolute inset-y-0 w-px bg-amber-500 shadow-sm pointer-events-none z-10"
        style={{ left: lineLeft }}
        title={`${name} · 第 ${day} 天`}
      />
      <div
        className="absolute top-1 size-2.5 -translate-x-1/2 rotate-45 rounded-[1px] bg-amber-500 border border-amber-600 shadow pointer-events-none z-10"
        style={{ left: lineLeft }}
        title={`${name} · 第 ${day} 天`}
      />
      <div
        className={cn(
          "absolute top-1 max-w-[88px] truncate text-[9px] font-medium text-amber-800 dark:text-amber-300 whitespace-nowrap pointer-events-none z-10",
          anchor === "end" ? "-translate-x-full pr-1" : "pl-1.5"
        )}
        style={{ left: lineLeft }}
        title={`${name} · +${day}`}
      >
        {name}
      </div>
    </>
  );
}

function CardErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive space-y-0.5 list-disc pl-4">
      {errors.map((err) => (
        <li key={err}>{err}</li>
      ))}
    </ul>
  );
}

function ConfirmDeleteButton({
  disabled,
  label = "删除",
  title,
  message,
  className,
  destructive = false,
  onConfirm,
}: {
  disabled?: boolean;
  label?: string;
  title: string;
  message: string;
  className?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          className
        )}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDestructiveDialog
        open={open}
        title={title}
        message={message}
        confirmLabel="删除"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
      />
    </>
  );
}

function PhaseCard({
  phase,
  allPhases,
  allNodes,
  totalDurationDays,
  disabled,
  onUpdate,
  onDelete,
  onOpenTasks,
}: {
  phase: EditableModelPhase;
  allPhases: EditableModelPhase[];
  allNodes: EditableModelNode[];
  totalDurationDays: number;
  disabled?: boolean;
  onUpdate: (phase: EditableModelPhase) => void;
  onDelete: () => void;
  onOpenTasks: () => void;
}) {
  const [draft, setDraft] = useState(phase);

  useEffect(() => {
    setDraft(phase);
  }, [phase]);

  const previewLayout = useMemo(() => {
    const phases = allPhases.map((p) => (p.key === phase.key ? draft : p));
    return layoutProjectModelTimeline(phases, allNodes, totalDurationDays);
  }, [allPhases, allNodes, draft, phase.key, totalDurationDays]);

  const previewPhases = useMemo(
    () => allPhases.map((p) => (p.key === phase.key ? draft : p)),
    [allPhases, draft, phase.key]
  );
  const nameErrors = useMemo(
    () => collectProjectModelNameErrors(previewPhases, allNodes).get(phase.key) ?? [],
    [previewPhases, allNodes, phase.key]
  );
  const previewPhase = previewLayout.phases.find((p) => p.key === phase.key);
  const cardErrors = [...nameErrors, ...(previewPhase?.errors ?? [])];
  const progressLabel =
    previewPhase?.computedProgressWeight != null
      ? `${previewPhase.computedProgressWeight}%`
      : "—";

  function commitUpdate(next: EditableModelPhase) {
    setDraft(next);
    const phases = allPhases.map((p) => (p.key === phase.key ? next : p));
    const layout = layoutProjectModelTimeline(phases, allNodes, totalDurationDays);
    const laid = layout.phases.find((p) => p.key === phase.key);
    onUpdate({
      ...next,
      tasks: phase.tasks ?? [],
      progressWeight: laid?.computedProgressWeight ?? 0,
    });
  }

  function patch(next: Partial<EditableModelPhase>) {
    commitUpdate({ ...draft, ...next });
  }

  return (
    <div
      className={cn(
        "space-y-2",
        cardErrors.length > 0 && "rounded-md border border-destructive bg-destructive/5 p-2"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled}
          onClick={onOpenTasks}
        >
          查看阶段任务清单
          {(phase.tasks?.length ?? 0) > 0 ? ` (${phase.tasks.length})` : ""}
        </Button>
        <ConfirmDeleteButton
          disabled={disabled}
          label="删除阶段"
          className="h-8"
          destructive
          title="删除阶段"
          message={`确定删除阶段「${phase.name.trim() || "未命名阶段"}」？此操作不可撤销。`}
          onConfirm={onDelete}
        />
      </div>

      <div className="grid grid-cols-[1fr_56px_48px] gap-2 items-end">
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">阶段名称</Label>
          <Input
            value={draft.name}
            disabled={disabled}
            className={cn("h-8", nameErrors.length > 0 && "border-destructive")}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">排序</Label>
          <DraftNumberInput
            min={0}
            value={draft.sortOrder}
            disabled={disabled}
            className="h-8"
            onChange={(sortOrder) => patch({ sortOrder })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">占比</Label>
          <div
            className="flex h-8 items-center justify-center rounded-md border bg-muted/40 px-1 text-xs text-muted-foreground"
            title="按本阶段工期占项目总工期比例自动计算"
          >
            {progressLabel}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">开始时间</span>
          <PhaseTimeRefRow
            idPrefix={`${phase.key}-start`}
            refValue={draft.startRef}
            selfKey={phase.key}
            allPhases={allPhases}
            allNodes={allNodes}
            includeDuration={false}
            disabled={disabled}
            offsetValue={draft.startOffset}
            offsetMode="signed"
            onRefChange={(startRef) =>
              patch({
                startRef: sanitizeTimeRef(startRef, phase.key, allPhases, allNodes, PROJECT_START_REF),
              })
            }
            onOffsetChange={(startOffset) => patch({ startOffset })}
          />
        </div>

        <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">结束时间</span>
          <PhaseTimeRefRow
            idPrefix={`${phase.key}-end`}
            refValue={draft.endRef}
            selfKey={phase.key}
            allPhases={allPhases}
            allNodes={allNodes}
            includeDuration
            disabled={disabled}
            offsetValue={draft.endRef === DURATION_REF ? (draft.durationDays ?? 1) : draft.endOffset}
            offsetMode={draft.endRef === DURATION_REF ? "duration" : "signed"}
            onRefChange={(endRef) =>
              patch({
                endRef: sanitizeTimeRef(endRef, phase.key, allPhases, allNodes, DURATION_REF),
                ...(endRef === DURATION_REF ? {} : { durationDays: draft.durationDays }),
              })
            }
            onOffsetChange={(value) =>
              patch(
                draft.endRef === DURATION_REF ? { durationDays: value } : { endOffset: value }
              )
            }
          />
        </div>
      </div>

      <CardErrorList errors={cardErrors} />
    </div>
  );
}

function PhaseTasksPanel({
  phase,
  disabled,
  onUpdateTasks,
  onBack,
}: {
  phase: EditableModelPhase;
  disabled?: boolean;
  onUpdateTasks: (tasks: EditableModelTask[]) => void;
  onBack: () => void;
}) {
  const tasks = sortTasks(phase.tasks ?? []);

  function patchTask(taskKey: string, patch: Partial<EditableModelTask>) {
    onUpdateTasks(
      tasks.map((task) => (task.key === taskKey ? { ...task, ...patch } : task))
    );
  }

  function addTask() {
    const nextOrder = tasks.length === 0 ? 1 : Math.max(...tasks.map((t) => t.sortOrder)) + 1;
    onUpdateTasks([...tasks, createBlankTask(nextOrder)]);
  }

  function deleteTask(taskKey: string) {
    onUpdateTasks(tasks.filter((t) => t.key !== taskKey));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-4">
          <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={onBack}>
            ← 阶段
          </Button>
          <p className="truncate text-sm font-medium">
            {phase.name}
            <span className="text-muted-foreground font-normal"> · 任务</span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0"
          disabled={disabled}
          onClick={addTask}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          添加
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">暂无任务，点击「添加」创建</p>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_56px_72px_40px] gap-2 px-0.5 text-[11px] text-muted-foreground">
            <span>任务名称</span>
            <span>排序</span>
            <span>参考工期</span>
            <span className="text-right">操作</span>
          </div>
          {tasks.map((task) => (
            <div key={task.key} className="grid grid-cols-[1fr_56px_72px_40px] gap-2 items-center">
              <Input
                value={task.name}
                disabled={disabled}
                className="h-8"
                onChange={(e) => patchTask(task.key, { name: e.target.value })}
              />
              <DraftNumberInput
                min={0}
                value={task.sortOrder}
                disabled={disabled}
                className="h-8"
                onChange={(sortOrder) => patchTask(task.key, { sortOrder })}
              />
              <DraftNumberInput
                min={1}
                fallback={1}
                value={task.durationDays}
                disabled={disabled}
                className="h-8"
                onChange={(durationDays) => patchTask(task.key, { durationDays })}
              />
              <div className="flex justify-end">
                <ConfirmDeleteButton
                  disabled={disabled}
                  label="删除"
                  className="h-7 px-2 text-xs"
                  title="删除任务"
                  message={`确定删除任务「${task.name.trim() || "未命名任务"}」？此操作不可撤销。`}
                  onConfirm={() => deleteTask(task.key)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeCard({
  node,
  allPhases,
  allNodes,
  totalDurationDays,
  disabled,
  onUpdate,
  onDelete,
}: {
  node: EditableModelNode;
  allPhases: EditableModelPhase[];
  allNodes: EditableModelNode[];
  totalDurationDays: number;
  disabled?: boolean;
  onUpdate: (node: EditableModelNode) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(node);

  useEffect(() => {
    setDraft(node);
  }, [node]);

  const previewLayout = useMemo(() => {
    const nodes = allNodes.map((n) => (n.key === node.key ? draft : n));
    return layoutProjectModelTimeline(allPhases, nodes, totalDurationDays);
  }, [allNodes, allPhases, draft, node.key, totalDurationDays]);

  const previewNodes = useMemo(
    () => allNodes.map((n) => (n.key === node.key ? draft : n)),
    [allNodes, draft, node.key]
  );
  const nameErrors = useMemo(
    () => collectProjectModelNameErrors(allPhases, previewNodes).get(node.key) ?? [],
    [allPhases, previewNodes, node.key]
  );

  const previewNode = previewLayout.nodes.find((n) => n.key === node.key);
  const cardErrors = [...nameErrors, ...(previewNode?.errors ?? [])];
  const previewDay = previewNode?.day ?? null;

  function patch(next: Partial<EditableModelNode>) {
    const updated = { ...draft, ...next };
    setDraft(updated);
    onUpdate(updated);
  }

  return (
    <div
      className={cn(
        "space-y-3",
        cardErrors.length > 0
          ? "rounded-md border border-destructive bg-destructive/5 p-2"
          : undefined
      )}
    >
      <div className="flex items-center justify-end gap-2">
        <ConfirmDeleteButton
          disabled={disabled}
          label="删除节点"
          className="h-8"
          destructive
          title="删除节点"
          message={`确定删除节点「${node.name.trim() || "未命名节点"}」？此操作不可撤销。`}
          onConfirm={onDelete}
        />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1">
          <Label className="text-xs text-amber-800 dark:text-amber-300">节点名称</Label>
          <Input
            value={draft.name}
            disabled={disabled}
            className={cn("h-8", nameErrors.length > 0 && "border-destructive")}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1 w-20">
          <Label className="text-xs">排序</Label>
          <DraftNumberInput
            min={0}
            value={draft.sortOrder}
            disabled={disabled}
            className="h-8"
            onChange={(sortOrder) => patch({ sortOrder })}
          />
        </div>
        <div className="space-y-1 w-20">
          <Label className="text-xs">时间</Label>
          <div
            className="flex h-8 items-center rounded-md border border-amber-500/30 bg-amber-500/5 px-2 text-sm text-amber-800 dark:text-amber-300"
            title="关键节点无工期，仅一个时间点"
          >
            {previewDay != null ? `+${previewDay}` : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <TimeRefPicker
          id={`${node.key}-timeRef`}
          label="时间 · 参照"
          value={draft.timeRef}
          selfKey={node.key}
          allPhases={allPhases}
          allNodes={allNodes}
          includeDuration={false}
          disabled={disabled}
          onChange={(timeRef) =>
            patch({
              timeRef: sanitizeTimeRef(timeRef, node.key, allPhases, allNodes, PROJECT_START_REF),
            })
          }
        />
        <div className="space-y-2">
          <Label className="text-xs">时间 · 浮动（自然日，可正可负）</Label>
          <DraftNumberInput
            allowNegative
            value={draft.timeOffset}
            disabled={disabled}
            className="h-10"
            onChange={(timeOffset) => patch({ timeOffset })}
          />
        </div>
      </div>

      <CardErrorList errors={cardErrors} />
    </div>
  );
}

export function collectProjectModelGanttBlockers(
  phases: EditableModelPhase[],
  nodes: EditableModelNode[],
  totalDurationDays: number
): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();

  function push(message: string) {
    if (!message || seen.has(message)) return;
    seen.add(message);
    messages.push(message);
  }

  for (const phase of phases) {
    if (!phase.name.trim()) {
      push("存在未填写名称的阶段，请补充后再保存");
    }
    for (const task of phase.tasks ?? []) {
      if (!task.name.trim()) {
        push(`阶段「${phase.name.trim() || "未命名阶段"}」中存在未填写名称的任务`);
      }
    }
  }
  for (const node of nodes) {
    if (!node.name.trim()) {
      push("存在未填写名称的关键节点，请补充后再保存");
    }
  }

  const nameErrors = collectProjectModelNameErrors(phases, nodes);
  for (const list of nameErrors.values()) {
    for (const message of list) push(message);
  }

  const layout = layoutProjectModelTimeline(phases, nodes, totalDurationDays);
  for (const phase of layout.phases) {
    for (const err of phase.errors) {
      push(`阶段「${phase.name}」${err}`);
    }
  }
  for (const node of layout.nodes) {
    for (const err of node.errors) {
      push(`节点「${node.name}」${err}`);
    }
  }

  return messages;
}

export function hasProjectModelGanttBlockers(
  phases: EditableModelPhase[],
  nodes: EditableModelNode[],
  totalDurationDays: number
): boolean {
  return collectProjectModelGanttBlockers(phases, nodes, totalDurationDays).length > 0;
}

export function ProjectModelGanttEditor({
  totalDurationDays,
  savedPhases,
  onSavedPhasesChange,
  savedNodes,
  onSavedNodesChange,
  disabled,
}: Props) {
  const layout = useMemo(
    () => layoutProjectModelTimeline(savedPhases, savedNodes, totalDurationDays),
    [savedPhases, savedNodes, totalDurationDays]
  );
  const totalDays = layout.totalDays;
  const ganttMinWidth = GANTT_LABEL_WIDTH + totalDays * MIN_DAY_WIDTH;
  const orderedPhases = useMemo(() => sortPhases(savedPhases), [savedPhases]);
  const orderedNodes = useMemo(
    () =>
      [...savedNodes].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN")
      ),
    [savedNodes]
  );

  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (selection) return;
    if (orderedPhases[0]) {
      setSelection({ kind: "phase", key: orderedPhases[0].key });
      setExpandedPhases(new Set([orderedPhases[0].key]));
    } else if (orderedNodes[0]) {
      setSelection({ kind: "node", key: orderedNodes[0].key });
    }
  }, [orderedPhases, orderedNodes, selection]);

  useEffect(() => {
    if (!selection) return;
    if (selection.kind === "phase" && !savedPhases.some((p) => p.key === selection.key)) {
      setSelection(orderedPhases[0] ? { kind: "phase", key: orderedPhases[0].key } : null);
    }
    if (selection.kind === "node" && !savedNodes.some((n) => n.key === selection.key)) {
      setSelection(orderedNodes[0] ? { kind: "node", key: orderedNodes[0].key } : null);
    }
    if (selection.kind === "phase-tasks") {
      const phase = savedPhases.find((p) => p.key === selection.phaseKey);
      if (!phase) {
        setSelection(orderedPhases[0] ? { kind: "phase", key: orderedPhases[0].key } : null);
      }
    }
  }, [orderedNodes, orderedPhases, savedNodes, savedPhases, selection]);

  function togglePhaseExpanded(phaseKey: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) next.delete(phaseKey);
      else next.add(phaseKey);
      return next;
    });
  }

  function savePhase(next: EditableModelPhase) {
    const exists = savedPhases.some((p) => p.key === next.key);
    onSavedPhasesChange(
      exists
        ? savedPhases.map((p) => (p.key === next.key ? { ...next, tasks: next.tasks ?? [] } : p))
        : [...savedPhases, { ...next, tasks: next.tasks ?? [] }]
    );
  }

  function updatePhaseTasks(phaseKey: string, tasks: EditableModelTask[]) {
    onSavedPhasesChange(
      savedPhases.map((p) => (p.key === phaseKey ? { ...p, tasks } : p))
    );
  }

  function openPhaseTasks(phaseKey: string) {
    setExpandedPhases((prev) => new Set(prev).add(phaseKey));
    setSelection({ kind: "phase-tasks", phaseKey });
  }

  function saveNode(next: EditableModelNode) {
    const exists = savedNodes.some((n) => n.key === next.key);
    onSavedNodesChange(
      exists ? savedNodes.map((n) => (n.key === next.key ? next : n)) : [...savedNodes, next]
    );
  }

  function deletePhase(key: string) {
    const remaining = savedPhases.filter((p) => p.key !== key);
    onSavedPhasesChange(
      remaining.map((p) => ({
        ...p,
        tasks: p.tasks ?? [],
        startRef: sanitizeTimeRef(p.startRef, p.key, remaining, savedNodes, PROJECT_START_REF),
        endRef: sanitizeTimeRef(p.endRef, p.key, remaining, savedNodes, DURATION_REF),
      }))
    );
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    const selectionRemoved =
      (selection?.kind === "phase" && selection.key === key) ||
      (selection?.kind === "phase-tasks" && selection.phaseKey === key);
    if (selectionRemoved) {
      setSelection(remaining[0] ? { kind: "phase", key: remaining[0].key } : null);
    }
  }

  function deleteNode(key: string) {
    const remaining = savedNodes.filter((n) => n.key !== key);
    onSavedNodesChange(
      remaining.map((n) => ({
        ...n,
        timeRef: sanitizeTimeRef(n.timeRef, n.key, savedPhases, remaining, PROJECT_START_REF),
      }))
    );
  }

  function addPhase() {
    const ordered = sortPhases(savedPhases);
    const previousPhase = ordered.length > 0 ? ordered[ordered.length - 1] : undefined;
    const nextOrder =
      savedPhases.length === 0 ? 1 : Math.max(...savedPhases.map((p) => p.sortOrder)) + 1;
    const name = nextDefaultSequencedName("新阶段", savedPhases.map((p) => p.name));
    const phase = createBlankPhase(nextOrder, name, previousPhase?.key);
    onSavedPhasesChange([...savedPhases, phase]);
    setExpandedPhases((prev) => new Set(prev).add(phase.key));
    setSelection({ kind: "phase", key: phase.key });
  }

  function addNode() {
    const nextOrder =
      savedNodes.length === 0 ? 1 : Math.max(...savedNodes.map((n) => n.sortOrder)) + 1;
    const name = nextDefaultSequencedName("新节点", [
      ...savedPhases.map((p) => p.name),
      ...savedNodes.map((n) => n.name),
    ]);
    const node = createBlankNode(nextOrder, name);
    onSavedNodesChange([...savedNodes, node]);
    setSelection({ kind: "node", key: node.key });
  }

  const selectedPhase =
    selection?.kind === "phase" || selection?.kind === "phase-tasks"
      ? savedPhases.find((p) =>
          selection.kind === "phase" ? p.key === selection.key : p.key === selection.phaseKey
        )
      : undefined;
  const selectedNode =
    selection?.kind === "node"
      ? savedNodes.find((n) => n.key === selection.key)
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="grid min-h-0 flex-1 items-stretch gap-3 lg:grid-cols-[minmax(200px,260px)_1fr]">
        <div className="min-h-0 overflow-y-auto rounded-md border bg-muted/10 p-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                阶段
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={disabled}
                onClick={addPhase}
                title="添加阶段"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {orderedPhases.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-2">暂无阶段</p>
            ) : (
              <div className="space-y-1">
              {orderedPhases.map((phase) => {
                const expanded = expandedPhases.has(phase.key);
                const phaseActive =
                  (selection?.kind === "phase" && selection.key === phase.key) ||
                  (selection?.kind === "phase-tasks" && selection.phaseKey === phase.key);
                const tasksViewActive =
                  selection?.kind === "phase-tasks" && selection.phaseKey === phase.key;
                const tasks = sortTasks(phase.tasks ?? []);
                return (
                  <div key={phase.key} className="space-y-0.5">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 hover:bg-muted"
                        disabled={tasks.length === 0}
                        onClick={() => togglePhaseExpanded(phase.key)}
                      >
                        {tasks.length === 0 ? (
                          <span className="inline-block w-3.5" />
                        ) : expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted",
                          phaseActive && "bg-primary/10 font-medium text-primary"
                        )}
                        onClick={() => {
                          setSelection({ kind: "phase", key: phase.key });
                          setExpandedPhases((prev) => new Set(prev).add(phase.key));
                        }}
                      >
                        {phase.name}
                        {tasks.length > 0 ? (
                          <span className="text-muted-foreground"> ({tasks.length})</span>
                        ) : null}
                      </button>
                    </div>
                    {expanded
                      ? tasks.map((task) => (
                          <button
                            key={task.key}
                            type="button"
                            className={cn(
                              "w-full truncate rounded py-1 pl-11 pr-1.5 text-left text-[11px] hover:bg-muted",
                              tasksViewActive && "bg-primary/10 text-primary"
                            )}
                            onClick={() => openPhaseTasks(phase.key)}
                          >
                            {task.name}
                          </button>
                        ))
                      : null}
                  </div>
                );
              })}
              </div>
            )}

          <div className="space-y-1 border-t pt-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                关键节点
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-amber-800 hover:bg-amber-500/10 dark:text-amber-300"
                disabled={disabled}
                onClick={addNode}
                title="添加节点"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {orderedNodes.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-2">暂无节点</p>
            ) : (
              orderedNodes.map((node) => {
                const nodeSelected = selection?.kind === "node" && selection.key === node.key;
                return (
                  <button
                    key={node.key}
                    type="button"
                    className={cn(
                      "w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted",
                      nodeSelected && "bg-amber-500/15 font-medium text-amber-800 dark:text-amber-300"
                    )}
                    onClick={() => setSelection({ kind: "node", key: node.key })}
                  >
                    ◆ {node.name}
                  </button>
                );
              })
            )}
          </div>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-md border bg-muted/10 p-2">
          {!selection ? (
            <p className="py-8 text-center text-sm text-muted-foreground">请在左侧选择阶段或节点</p>
          ) : selection.kind === "phase" && selectedPhase ? (
            <PhaseCard
              phase={selectedPhase}
              allPhases={savedPhases}
              allNodes={savedNodes}
              totalDurationDays={totalDurationDays}
              disabled={disabled}
              onUpdate={savePhase}
              onDelete={() => deletePhase(selectedPhase.key)}
              onOpenTasks={() => openPhaseTasks(selectedPhase.key)}
            />
          ) : selection.kind === "phase-tasks" && selectedPhase ? (
            <PhaseTasksPanel
              phase={selectedPhase}
              disabled={disabled}
              onUpdateTasks={(tasks) => updatePhaseTasks(selectedPhase.key, tasks)}
              onBack={() => setSelection({ kind: "phase", key: selectedPhase.key })}
            />
          ) : selection.kind === "node" && selectedNode ? (
            <NodeCard
              node={selectedNode}
              allPhases={savedPhases}
              allNodes={savedNodes}
              totalDurationDays={totalDurationDays}
              disabled={disabled}
              onUpdate={saveNode}
              onDelete={() => deleteNode(selectedNode.key)}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">所选条目不存在或已删除</p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="w-full" style={{ minWidth: ganttMinWidth }}>
            <div className="flex w-full border-b bg-muted/40 text-[10px] text-muted-foreground sticky top-0 z-10">
              <div
                className="shrink-0 border-r px-2 py-2"
                style={{ width: GANTT_LABEL_WIDTH }}
              >
                名称
              </div>
              <div className="relative flex min-w-0 flex-1">
                {Array.from({ length: totalDays }, (_, i) => (
                  <div
                    key={i}
                    className="min-w-0 flex-1 border-r border-border/50 text-center leading-7"
                  >
                    {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              {layout.phases.map((phase) => (
                <div key={phase.key} className="flex w-full border-b min-h-[44px]">
                  <div
                    className="shrink-0 border-r px-2 py-2 text-xs truncate"
                    style={{ width: GANTT_LABEL_WIDTH }}
                    title={phase.name}
                  >
                    {phase.name}
                    {phase.computedProgressWeight != null ? (
                      <span className="text-muted-foreground"> · {phase.computedProgressWeight}%</span>
                    ) : null}
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <div
                      className="absolute top-2.5 z-[1] h-6 min-w-[2px] rounded-sm bg-primary px-1 text-[10px] leading-6 text-primary-foreground truncate"
                      style={{
                        left: ganttLeftPct(phase.startDay, totalDays),
                        width: ganttWidthPct(Math.max(phase.barDays, 1), totalDays),
                      }}
                      title={`${phase.name} · 第 ${phase.startDay}–${phase.endDay} 天`}
                    >
                      +{phase.startDay}~+{phase.endDay}
                    </div>
                  </div>
                </div>
              ))}

              {layout.nodes.length > 0 ? (
                <div
                  className="absolute inset-y-0 pointer-events-none"
                  style={{ left: GANTT_LABEL_WIDTH, right: 0 }}
                >
                  {layout.nodes.map((node) => (
                    <GanttMilestoneLine
                      key={node.key}
                      day={node.day}
                      name={node.name}
                      totalDays={totalDays}
                      timeRef={node.timeRef}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
