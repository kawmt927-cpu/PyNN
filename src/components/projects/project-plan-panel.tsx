"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PhaseStatus, ProjectTaskStatus } from "@prisma/client";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField, ToneSelect } from "@/components/ui/select-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PHASE_STATUS_LABELS, PROJECT_TASK_STATUS_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { addCalendarDays, countCalendarDays, eachCalendarDay, toDateOnly } from "@/lib/projects/workdays";
import {
  clearScheduleReturn,
  clearTaskFormDraft,
  loadTaskFormDraft,
  peekScheduleReturn,
  saveScheduleReturn,
  saveTaskFormDraft,
  withScheduleReturnTask,
} from "@/lib/projects/task-form-draft";
import {
  applyProjectModelToProject,
  createProjectPhase,
  deleteProjectPhase,
} from "@/app/(dashboard)/projects/actions";
import {
  createProjectTask,
  createProjectTasksBatch,
  deleteProjectTask,
  updateProjectPhasePlan,
  updateProjectTask,
} from "@/app/(dashboard)/projects/project-plan-actions";

const GANTT_LABEL_WIDTH = 160;
/** 固定日宽，保证长工期可横向滚动看全 */
const DAY_WIDTH = 14;

const PHASE_STATUS_OPTIONS = (Object.keys(PHASE_STATUS_LABELS) as PhaseStatus[]).map((status) => ({
  value: status,
  label: PHASE_STATUS_LABELS[status],
}));

const TASK_STATUS_OPTIONS = (Object.keys(PROJECT_TASK_STATUS_LABELS) as ProjectTaskStatus[]).map(
  (status) => ({
    value: status,
    label: PROJECT_TASK_STATUS_LABELS[status],
  })
);

export type PlanPhase = {
  id: string;
  name: string;
  sortOrder: number;
  progressWeight: number;
  status: PhaseStatus;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  sourceModelPhaseId: string | null;
  tasks: PlanTask[];
};

export type PlanTask = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectTaskStatus;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualCompletedAt: Date | null;
  cancelledNote: string | null;
  sortOrder: number;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type ProjectModelOption = {
  id: string;
  name: string;
  phaseCount: number;
  totalDurationDays: number;
};

type Props = {
  projectId: string;
  canEdit: boolean;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  phases: PlanPhase[];
  projectModels: ProjectModelOption[];
  assignees: Array<{ id: string; name: string }>;
  templateTasksByPhaseId: Record<string, Array<{ id: string; name: string; durationDays: number }>>;
  scheduleHref: string | null;
  /** 从资源排班返回时带上，用于重新打开任务详情并恢复草稿 */
  initialTaskId?: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 相对项目计划开始的 1-based 自然日序号（起始日当天为 1，早于起始日则为 0 或负数） */
function dayIndex(date: Date, projectStart: Date): number {
  const diffDays = Math.round(
    (toDateOnly(date).getTime() - toDateOnly(projectStart).getTime()) / 86_400_000
  );
  return diffDays + 1;
}

function ganttBarStyle(
  startDay: number,
  endDay: number,
  totalDays: number,
  dayWidth = DAY_WIDTH
) {
  const start = clamp(startDay, 1, totalDays);
  const end = clamp(Math.max(endDay, start), 1, totalDays);
  return {
    left: (start - 1) * dayWidth,
    width: Math.max(end - start + 1, 1) * dayWidth,
  };
}

type GanttMonthBand = {
  key: string;
  label: string;
  startIndex: number;
  dayCount: number;
  year: number;
  month: number;
};

/** 按连续月份合并表头色带，跨年时带年份以免歧义 */
function buildGanttMonthBands(days: Date[]): GanttMonthBand[] {
  const bands: GanttMonthBand[] = [];
  const years = new Set(days.map((d) => d.getFullYear()));
  const multiYear = years.size > 1;

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const last = bands[bands.length - 1];
    if (last && last.year === year && last.month === month) {
      last.dayCount += 1;
    } else {
      bands.push({
        key: `${year}-${month}-${i}`,
        label: multiYear ? `${year}年${month}月` : `${month}月`,
        startIndex: i,
        dayCount: 1,
        year,
        month,
      });
    }
  }
  return bands;
}

function sortByOrder<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
}

type AnyResult = { error?: string; warning?: string; phaseOutOfSyncWarning?: string };

type TaskFormResult = { error?: string; warning?: string };

function validateTaskDateRange(input: {
  startAt: string;
  endAt: string;
  projectStartAt: string | null;
  projectEndAt: string | null;
  phaseStartAt: string | null;
  phaseEndAt: string | null;
}): TaskFormResult {
  if (!input.startAt || !input.endAt) return { error: "请填写任务起止日期" };
  if (input.startAt > input.endAt) return { error: "任务结束不能早于开始" };

  if (input.projectStartAt && input.startAt < input.projectStartAt) {
    return {
      error: `开始时间不能早于项目计划开始（${input.projectStartAt}）`,
    };
  }

  let warning: string | undefined;
  if (input.projectEndAt && input.endAt > input.projectEndAt) {
    warning = `结束日晚于项目计划结束（${input.projectEndAt}），将标记为超期任务`;
  }

  if (input.phaseStartAt && input.phaseEndAt) {
    if (input.startAt < input.phaseStartAt || input.endAt > input.phaseEndAt) {
      const phaseWarning = `任务时间超出阶段计划窗口（${input.phaseStartAt} ~ ${input.phaseEndAt}），仍可保存`;
      warning = warning ? `${warning}；${phaseWarning}` : phaseWarning;
    }
  }

  return warning ? { warning } : {};
}

type TaskOverdueLevel = "project" | "phase" | null;

function resolveTaskOverdueFlags(input: {
  startKey: string;
  endKey: string;
  projectEndKey: string | null;
  phaseStartKey: string | null;
  phaseEndKey: string | null;
}): { project: boolean; phase: boolean } {
  const project = Boolean(
    input.projectEndKey &&
      (input.startKey > input.projectEndKey || input.endKey > input.projectEndKey)
  );
  const phase = Boolean(
    input.phaseStartKey &&
      input.phaseEndKey &&
      (input.startKey < input.phaseStartKey || input.endKey > input.phaseEndKey)
  );
  return { project, phase };
}

function resolveDateOverdueLevel(
  dateKey: string,
  input: {
    projectEndKey: string | null;
    phaseStartKey: string | null;
    phaseEndKey: string | null;
  }
): TaskOverdueLevel {
  if (input.projectEndKey && dateKey > input.projectEndKey) return "project";
  if (input.phaseEndKey && dateKey > input.phaseEndKey) return "phase";
  if (input.phaseStartKey && dateKey < input.phaseStartKey) return "phase";
  return null;
}

const OVERDUE_BADGE_CLASS: Record<"project" | "phase", string> = {
  project:
    "rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300",
  phase:
    "rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const OVERDUE_DATE_CLASS: Record<"project" | "phase", string> = {
  project:
    "rounded bg-red-100 px-1 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  phase:
    "rounded bg-amber-100 px-1 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const OVERDUE_LABEL: Record<"project" | "phase", string> = {
  project: "项目超期",
  phase: "阶段超期",
};

export function ProjectPlanPanel({
  projectId,
  canEdit,
  plannedStartAt,
  plannedEndAt,
  phases,
  projectModels,
  assignees,
  templateTasksByPhaseId,
  scheduleHref,
  initialTaskId = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Set<string>>(() => new Set());
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [applyModelId, setApplyModelId] = useState("");
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [confirmDeletePhase, setConfirmDeletePhase] = useState<PlanPhase | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<PlanTask | null>(null);
  const restoredTaskRef = useRef(false);

  // 从排班返回：URL taskId 或 sessionStorage（排班内操作可能丢掉 URL 参数）
  useEffect(() => {
    if (restoredTaskRef.current) return;
    const taskId = initialTaskId || peekScheduleReturn(projectId);
    if (!taskId) return;
    restoredTaskRef.current = true;
    const phase = phases.find((p) => p.tasks.some((t) => t.id === taskId));
    if (phase) {
      setSelectedPhaseId(phase.id);
      setExpandedPhaseIds((prev) => new Set(prev).add(phase.id));
    }
    setEditingTaskId(taskId);
    clearScheduleReturn(projectId);
    // 勿立刻 replace 清掉 taskId：部分导航下会 remount 客户端，弹窗状态会被冲掉
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次恢复
  }, [initialTaskId, projectId]);

  function closeTaskEditor(options?: { clearDraft?: boolean }) {
    if (editingTaskId && options?.clearDraft) {
      clearTaskFormDraft(projectId, editingTaskId);
    }
    clearScheduleReturn(projectId);
    setEditingTaskId(null);
    if (initialTaskId) {
      router.replace(`/projects/${projectId}?tab=plan`, { scroll: false });
    }
  }

  const sortedPhases = useMemo(() => sortByOrder(phases), [phases]);
  const selectedPhase =
    sortedPhases.find((p) => p.id === selectedPhaseId) ?? sortedPhases[0] ?? null;
  const editingTask =
    editingTaskId != null
      ? selectedPhase?.tasks.find((t) => t.id === editingTaskId) ??
        sortedPhases.flatMap((p) => p.tasks).find((t) => t.id === editingTaskId) ??
        null
      : null;

  const hasPlannedWindow = Boolean(plannedStartAt && plannedEndAt);
  const projectStart = plannedStartAt ? toDateOnly(plannedStartAt) : null;
  const projectEnd = plannedEndAt ? toDateOnly(plannedEndAt) : null;
  const projectStartKey = plannedStartAt ? formatLocalDateInput(plannedStartAt) : null;
  const projectEndKey = plannedEndAt ? formatLocalDateInput(plannedEndAt) : null;
  const totalDays = projectStart && projectEnd ? countCalendarDays(projectStart, projectEnd) : 0;
  const nextPhaseSortOrder =
    sortedPhases.length === 0 ? 0 : Math.max(...sortedPhases.map((p) => p.sortOrder)) + 1;
  const selectedModel = projectModels.find((m) => m.id === applyModelId);

  function togglePhaseExpanded(phaseId: string) {
    setExpandedPhaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  function selectPhase(phaseId: string) {
    setSelectedPhaseId(phaseId);
    setShowAddTask(false);
    setEditingTaskId(null);
  }

  function reportResult(result: AnyResult): boolean {
    if (result.error) {
      setError(result.error);
      return false;
    }
    const msg = result.warning ?? result.phaseOutOfSyncWarning;
    setWarning(msg ?? null);
    return true;
  }

  function handleApplyModel() {
    if (!applyModelId) return;
    setError(null);
    setWarning(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("modelId", applyModelId);
    startTransition(async () => {
      const result = await applyProjectModelToProject(fd);
      setConfirmApplyOpen(false);
      setApplyDialogOpen(false);
      if (!reportResult(result)) return;
      setApplyModelId("");
      router.refresh();
    });
  }

  function handleCreatePhase(input: {
    name: string;
    status: PhaseStatus;
    plannedStartAt: string;
    plannedEndAt: string;
  }) {
    setError(null);
    setWarning(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("name", input.name);
    fd.set("status", input.status);
    fd.set("sortOrder", String(nextPhaseSortOrder));
    if (input.plannedStartAt) fd.set("plannedStartAt", input.plannedStartAt);
    if (input.plannedEndAt) fd.set("plannedEndAt", input.plannedEndAt);
    startTransition(async () => {
      const result = await createProjectPhase(fd);
      if (!reportResult(result)) return;
      setShowAddPhase(false);
      router.refresh();
    });
  }

  function handleUpdatePhase(
    phaseId: string,
    input: { name: string; status: PhaseStatus; plannedStartAt: string; plannedEndAt: string }
  ) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await updateProjectPhasePlan({
        projectId,
        phaseId,
        plannedStartAt: input.plannedStartAt,
        plannedEndAt: input.plannedEndAt,
        name: input.name,
        status: input.status,
      });
      if (!reportResult(result)) return;
      router.refresh();
    });
  }

  function handleDeletePhase(phase: PlanPhase) {
    setError(null);
    setWarning(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("phaseId", phase.id);
    startTransition(async () => {
      const result = await deleteProjectPhase(fd);
      setConfirmDeletePhase(null);
      if (!reportResult(result)) return;
      if (selectedPhaseId === phase.id) setSelectedPhaseId(null);
      router.refresh();
    });
  }

  function handleCreateTask(
    phaseId: string,
    input: {
      name: string;
      description: string;
      plannedStartAt: string;
      plannedEndAt: string;
      status: ProjectTaskStatus;
      assigneeId: string;
      sourceModelTaskId?: string;
      actualCompletedAt?: string;
      cancelledNote?: string;
    }
  ): Promise<TaskFormResult> {
    setError(null);
    setWarning(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await createProjectTask({
          projectId,
          phaseId,
          name: input.name,
          description: input.description || undefined,
          plannedStartAt: input.plannedStartAt,
          plannedEndAt: input.plannedEndAt,
          status: input.status,
          assigneeId: input.assigneeId || undefined,
          sourceModelTaskId: input.sourceModelTaskId || undefined,
          actualCompletedAt: input.actualCompletedAt ?? null,
          cancelledNote: input.cancelledNote ?? null,
        });
        if (result.error) {
          resolve({ error: result.error });
          return;
        }
        if (result.warning) setWarning(result.warning);
        setShowAddTask(false);
        resolve({});
        router.refresh();
      });
    });
  }

  function handleCreateTasksBatch(
    phaseId: string,
    tasks: Array<{
      name: string;
      plannedStartAt: string;
      plannedEndAt: string;
      sourceModelTaskId?: string;
      status?: ProjectTaskStatus;
      assigneeId?: string;
    }>
  ): Promise<TaskFormResult> {
    setError(null);
    setWarning(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await createProjectTasksBatch({
          projectId,
          phaseId,
          tasks,
        });
        if (result.error) {
          resolve({ error: result.error });
          return;
        }
        if (result.warning) setWarning(result.warning);
        setShowAddTask(false);
        resolve({});
        router.refresh();
      });
    });
  }

  function handleUpdateTask(
    task: PlanTask,
    input: {
      name: string;
      description: string;
      plannedStartAt: string;
      plannedEndAt: string;
      status: ProjectTaskStatus;
      assigneeId: string;
      actualCompletedAt?: string;
      cancelledNote?: string;
    }
  ): Promise<TaskFormResult> {
    setError(null);
    setWarning(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await updateProjectTask({
          projectId,
          taskId: task.id,
          name: input.name,
          description: input.description,
          plannedStartAt: input.plannedStartAt,
          plannedEndAt: input.plannedEndAt,
          status: input.status,
          assigneeId: input.assigneeId || null,
          actualCompletedAt: input.actualCompletedAt ?? null,
          cancelledNote: input.cancelledNote ?? null,
        });
        if (result.error) {
          resolve({ error: result.error });
          return;
        }
        if (result.warning) setWarning(result.warning);
        clearTaskFormDraft(projectId, task.id);
        clearScheduleReturn(projectId);
        setEditingTaskId(null);
        if (initialTaskId) {
          router.replace(`/projects/${projectId}?tab=plan`, { scroll: false });
        }
        resolve({});
        router.refresh();
      });
    });
  }

  function handleDeleteTask(task: PlanTask) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await deleteProjectTask({ projectId, taskId: task.id });
      if (!reportResult(result)) return;
      clearTaskFormDraft(projectId, task.id);
      clearScheduleReturn(projectId);
      setConfirmDeleteTask(null);
      setEditingTaskId(null);
      if (initialTaskId) {
        router.replace(`/projects/${projectId}?tab=plan`, { scroll: false });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {!hasPlannedWindow ? (
        <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          请先在「概览」标签中填写项目计划开始与计划结束日期，随后即可套用项目模型或手动添加阶段与任务。
        </div>
      ) : null}
      {error ? (
        <p className="shrink-0 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {warning}
        </p>
      ) : null}

      <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
          <div className="flex max-h-[300px] flex-col gap-2 overflow-hidden rounded-md border p-2.5">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <p className="text-sm font-medium">阶段</p>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={!hasPlannedWindow || projectModels.length === 0}
                    title={
                      !hasPlannedWindow
                        ? "需先设置项目计划起止日期"
                        : projectModels.length === 0
                          ? "暂无可用项目模型"
                          : "套用项目模型"
                    }
                    onClick={() => {
                      setApplyModelId("");
                      setApplyDialogOpen(true);
                    }}
                  >
                    套用模型
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setShowAddPhase(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              {sortedPhases.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  暂无阶段。可套用项目模型快速生成，或点击「添加」手动创建。
                </p>
              ) : (
                <div className="space-y-0.5">
                  {sortedPhases.map((phase) => {
                    const active = selectedPhase?.id === phase.id;
                    const expanded = expandedPhaseIds.has(phase.id);
                    return (
                      <div key={phase.id} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="shrink-0 rounded p-0.5 hover:bg-muted disabled:opacity-30"
                          disabled={phase.tasks.length === 0}
                          onClick={() => togglePhaseExpanded(phase.id)}
                          title={expanded ? "在甘特中收起任务" : "在甘特中展开任务"}
                        >
                          {phase.tasks.length === 0 ? (
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
                            "min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                            active && "bg-primary/10 font-medium text-primary"
                          )}
                          onClick={() => selectPhase(phase.id)}
                        >
                          <span className="block truncate">{phase.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {PHASE_STATUS_LABELS[phase.status]}
                            {phase.plannedStartAt && phase.plannedEndAt
                              ? ` · ${formatLocalDateInput(phase.plannedStartAt)} ~ ${formatLocalDateInput(phase.plannedEndAt)}`
                              : " · 未设置日期"}
                            {phase.tasks.length > 0 ? ` · ${phase.tasks.length} 项任务` : ""}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {selectedPhase ? (
            <div className="grid max-h-[300px] gap-3 md:grid-cols-[minmax(240px,340px)_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto overscroll-contain rounded-md border p-2.5">
                <PhaseDetailForm
                  key={selectedPhase.id}
                  phase={selectedPhase}
                  canEdit={canEdit}
                  pending={pending}
                  onSave={(input) => handleUpdatePhase(selectedPhase.id, input)}
                  onDelete={() => setConfirmDeletePhase(selectedPhase)}
                />
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded-md border p-2.5">
                <div className="mb-2 flex shrink-0 items-center justify-between">
                  <p className="text-sm font-medium">任务</p>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => {
                        setEditingTaskId(null);
                        setShowAddTask(true);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      添加任务
                    </Button>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  {selectedPhase.tasks.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">该阶段暂无任务</p>
                  ) : (
                    <div className="space-y-1">
                      {sortByOrder(selectedPhase.tasks).map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          projectEndKey={projectEndKey}
                          phaseStartKey={
                            selectedPhase.plannedStartAt
                              ? formatLocalDateInput(selectedPhase.plannedStartAt)
                              : null
                          }
                          phaseEndKey={
                            selectedPhase.plannedEndAt
                              ? formatLocalDateInput(selectedPhase.plannedEndAt)
                              : null
                          }
                          onOpen={() => {
                            setShowAddTask(false);
                            setEditingTaskId(task.id);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex max-h-[300px] items-center justify-center rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              选择阶段后可在此编辑基本信息与任务
            </div>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ProjectPlanGantt
            projectStart={projectStart}
            totalDays={totalDays}
            phases={sortedPhases}
            expandedPhaseIds={expandedPhaseIds}
            selectedPhaseId={selectedPhase?.id ?? null}
            onSelectPhase={selectPhase}
          />
        </div>

      <Dialog
        open={showAddPhase}
        onOpenChange={(open) => {
          if (pending) return;
          setShowAddPhase(open);
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={!pending} closeOnOutsideClick={!pending}>
          <DialogHeader>
            <DialogTitle>添加阶段</DialogTitle>
            <DialogDescription>填写阶段名称与计划日期，保存后会出现在左侧列表中。</DialogDescription>
          </DialogHeader>
          <AddPhaseForm
            key={showAddPhase ? "open" : "closed"}
            disabled={pending}
            onCancel={() => setShowAddPhase(false)}
            onSubmit={handleCreatePhase}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddTask && selectedPhase != null}
        onOpenChange={(open) => {
          if (pending) return;
          setShowAddTask(open);
        }}
      >
        <DialogContent className="max-w-lg" showCloseButton={!pending} closeOnOutsideClick={!pending}>
          <DialogHeader>
            <DialogTitle>添加任务</DialogTitle>
            <DialogDescription>
              {selectedPhase ? `阶段「${selectedPhase.name}」· 填写任务信息后保存。` : "填写任务信息后保存。"}
            </DialogDescription>
          </DialogHeader>
          {selectedPhase ? (
            <AddTaskForm
              key={`add-${selectedPhase.id}-${showAddTask}`}
              disabled={pending}
              phase={selectedPhase}
              projectStartKey={projectStartKey}
              projectEndKey={projectEndKey}
              assignees={assignees}
              scheduleHref={scheduleHref}
              templateTasks={
                selectedPhase.sourceModelPhaseId
                  ? templateTasksByPhaseId[selectedPhase.sourceModelPhaseId] ?? []
                  : []
              }
              onCancel={() => setShowAddTask(false)}
              onSubmit={(input) => handleCreateTask(selectedPhase.id, input)}
              onBatchSubmit={(tasks) => handleCreateTasksBatch(selectedPhase.id, tasks)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingTask != null}
        onOpenChange={(open) => {
          if (pending) return;
          if (!open) closeTaskEditor();
        }}
      >
        <DialogContent className="max-w-lg" showCloseButton={!pending} closeOnOutsideClick={!pending}>
          <DialogHeader>
            <DialogTitle>任务详情</DialogTitle>
            <DialogDescription>
              {editingTask ? `查看并编辑「${editingTask.name}」。` : "查看并编辑任务。"}
            </DialogDescription>
          </DialogHeader>
          {editingTask ? (
            <EditTaskForm
              key={editingTask.id}
              projectId={projectId}
              task={editingTask}
              phase={
                sortedPhases.find((p) => p.tasks.some((t) => t.id === editingTask.id)) ??
                selectedPhase
              }
              canEdit={canEdit}
              projectStartKey={projectStartKey}
              projectEndKey={projectEndKey}
              assignees={assignees}
              scheduleHref={
                scheduleHref
                  ? withScheduleReturnTask(scheduleHref, editingTask.id)
                  : null
              }
              disabled={pending}
              onCancel={() => closeTaskEditor({ clearDraft: true })}
              onDelete={() => setConfirmDeleteTask(editingTask)}
              onSubmit={(input) => handleUpdateTask(editingTask, input)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={applyDialogOpen}
        onOpenChange={(open) => {
          if (pending) return;
          setApplyDialogOpen(open);
          if (!open) setApplyModelId("");
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={!pending} closeOnOutsideClick={!pending}>
          <DialogHeader>
            <DialogTitle>套用项目模型</DialogTitle>
            <DialogDescription>
              套用后将替换当前全部阶段及其下的项目任务，请谨慎操作。
            </DialogDescription>
          </DialogHeader>
          {!hasPlannedWindow ? (
            <p className="text-sm text-muted-foreground">需先设置项目计划起止日期才能套用模型。</p>
          ) : projectModels.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无可用的启用项目模型，请前往系统配置创建。</p>
          ) : (
            <div className="space-y-4">
              <SelectField
                id="plan-apply-model"
                name="modelId"
                label="选择模型"
                value={applyModelId || "__none__"}
                onValueChange={(v) => setApplyModelId(v === "__none__" ? "" : v)}
                options={[
                  { value: "__none__", label: "请选择模型" },
                  ...projectModels.map((m) => ({
                    value: m.id,
                    label: `${m.name}（${m.phaseCount} 阶段 · ${m.totalDurationDays} 天）`,
                  })),
                ]}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setApplyDialogOpen(false);
                    setApplyModelId("");
                  }}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={pending || !applyModelId}
                  onClick={() => {
                    setApplyDialogOpen(false);
                    setConfirmApplyOpen(true);
                  }}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={confirmApplyOpen}
        title="套用项目模型"
        message={
          selectedModel
            ? `确定用「${selectedModel.name}」替换当前全部阶段吗？现有阶段及其下的全部项目任务将被删除，此操作不可撤销。`
            : ""
        }
        confirmLabel="确认套用"
        variant="destructive"
        pending={pending}
        onCancel={() => {
          setConfirmApplyOpen(false);
          setApplyDialogOpen(true);
        }}
        onConfirm={handleApplyModel}
      />

      <ConfirmDestructiveDialog
        open={confirmDeletePhase != null}
        title="删除阶段"
        message={
          confirmDeletePhase
            ? `确定删除阶段「${confirmDeletePhase.name}」？该阶段下的 ${confirmDeletePhase.tasks.length} 项任务将被一并删除，此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setConfirmDeletePhase(null)}
        onConfirm={() => confirmDeletePhase && handleDeletePhase(confirmDeletePhase)}
      />

      <ConfirmDestructiveDialog
        open={confirmDeleteTask != null}
        title="删除任务"
        message={confirmDeleteTask ? `确定删除任务「${confirmDeleteTask.name}」？此操作不可撤销。` : ""}
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setConfirmDeleteTask(null)}
        onConfirm={() => confirmDeleteTask && handleDeleteTask(confirmDeleteTask)}
      />
    </div>
  );
}

function AddPhaseForm({
  disabled,
  onCancel,
  onSubmit,
}: {
  disabled?: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; status: PhaseStatus; plannedStartAt: string; plannedEndAt: string }) => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<PhaseStatus>("NOT_STARTED");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  return (
    <div className="space-y-3">
      <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs">阶段名称</Label>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：需求调研" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">计划开始</Label>
          <Input className="h-8" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">计划结束</Label>
          <Input className="h-8" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">状态</Label>
        <SelectField
          id="add-phase-status"
          name="status"
          label=""
          value={status}
          onValueChange={(v) => setStatus(v as PhaseStatus)}
          options={PHASE_STATUS_OPTIONS}
        />
      </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={disabled || !name.trim()}
          onClick={() =>
            onSubmit({ name: name.trim(), status, plannedStartAt: startAt, plannedEndAt: endAt })
          }
        >
          保存
        </Button>
      </div>
    </div>
  );
}

function PhaseDetailForm({
  phase,
  canEdit,
  pending,
  onSave,
  onDelete,
}: {
  phase: PlanPhase;
  canEdit: boolean;
  pending: boolean;
  onSave: (input: { name: string; status: PhaseStatus; plannedStartAt: string; plannedEndAt: string }) => void;
  onDelete: () => void;
}) {
  const initialStart = phase.plannedStartAt ? formatLocalDateInput(phase.plannedStartAt) : "";
  const initialEnd = phase.plannedEndAt ? formatLocalDateInput(phase.plannedEndAt) : "";
  const [name, setName] = useState(phase.name);
  const [status, setStatus] = useState<PhaseStatus>(phase.status);
  const [startAt, setStartAt] = useState(initialStart);
  const [endAt, setEndAt] = useState(initialEnd);

  const dirty =
    name.trim() !== phase.name || status !== phase.status || startAt !== initialStart || endAt !== initialEnd;
  const canSave = name.trim() && startAt && endAt;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">基本信息</p>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          进度权重 {phase.progressWeight}%
        </span>
      </div>

      {canEdit ? (
        <div className="space-y-1.5">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">阶段名称</Label>
            <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">计划开始</Label>
              <Input className="h-8" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">计划结束</Label>
              <Input className="h-8" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">状态</Label>
            <ToneSelect
              id={`phase-status-${phase.id}`}
              name="status"
              size="sm"
              value={status}
              onValueChange={(v) => setStatus(v as PhaseStatus)}
              options={PHASE_STATUS_OPTIONS}
            />
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={onDelete}
            >
              删除阶段
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={pending || !dirty || !canSave}
              onClick={() => onSave({ name: name.trim(), status, plannedStartAt: startAt, plannedEndAt: endAt })}
            >
              保存
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="text-foreground">{phase.name}</p>
          <p>状态：{PHASE_STATUS_LABELS[phase.status]}</p>
          <p>
            计划：
            {phase.plannedStartAt && phase.plannedEndAt
              ? `${formatLocalDateInput(phase.plannedStartAt)} ~ ${formatLocalDateInput(phase.plannedEndAt)}`
              : "未设置"}
          </p>
        </div>
      )}
    </div>
  );
}

type TaskFormInput = {
  name: string;
  description: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status: ProjectTaskStatus;
  assigneeId: string;
  actualCompletedAt?: string;
  cancelledNote?: string;
};

function isTaskRangeFullyPast(startAt: string, endAt: string, todayKey = formatLocalDateInput(new Date())) {
  return Boolean(startAt && endAt && startAt < todayKey && endAt < todayKey);
}

/** 新建任务默认：计划开始=今天（夹入项目/阶段窗口），计划结束=阶段结束日 */
function defaultAddTaskDateRange(input: {
  projectStartKey: string | null;
  projectEndKey: string | null;
  phaseStartKey: string | null;
  phaseEndKey: string | null;
  todayKey?: string;
}): { startAt: string; endAt: string } {
  const today = input.todayKey ?? formatLocalDateInput(new Date());
  function clamp(value: string, min: string | null, max: string | null) {
    let next = value;
    if (min && next < min) next = min;
    if (max && next > max) next = max;
    return next;
  }

  let startAt = clamp(today, input.projectStartKey, input.projectEndKey);
  startAt = clamp(startAt, input.phaseStartKey, input.phaseEndKey);

  let endAt = input.phaseEndKey || input.projectEndKey || startAt;
  endAt = clamp(endAt, input.projectStartKey, input.projectEndKey);
  if (endAt < startAt) endAt = startAt;
  return { startAt, endAt };
}

type PastResolutionMode = "completed" | "cancelled" | "";

function PastTaskResolutionFields({
  mode,
  onModeChange,
  actualCompletedAt,
  onActualCompletedAtChange,
  cancelledNote,
  onCancelledNoteChange,
}: {
  mode: PastResolutionMode;
  onModeChange: (mode: PastResolutionMode) => void;
  actualCompletedAt: string;
  onActualCompletedAtChange: (value: string) => void;
  cancelledNote: string;
  onCancelledNoteChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/80 p-2.5 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-xs text-amber-800 dark:text-amber-300">
        计划区间已全部落在过去。请先选择一种处理方式，再填写对应信息后保存。
      </p>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            className="mt-1 h-3.5 w-3.5 accent-primary"
            name="past-task-resolution"
            checked={mode === "completed"}
            onChange={() => {
              onModeChange("completed");
              onCancelledNoteChange("");
            }}
          />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block text-xs font-medium">正常完结 · 填写实际完成时间</span>
            {mode === "completed" ? (
              <Input
                className="h-8 bg-background"
                type="date"
                value={actualCompletedAt}
                onChange={(e) => onActualCompletedAtChange(e.target.value)}
              />
            ) : null}
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            className="mt-1 h-3.5 w-3.5 accent-primary"
            name="past-task-resolution"
            checked={mode === "cancelled"}
            onChange={() => {
              onModeChange("cancelled");
              onActualCompletedAtChange("");
            }}
          />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block text-xs font-medium">中途作废 · 填写取消备注</span>
            {mode === "cancelled" ? (
              <Textarea
                className="min-h-[56px] bg-background text-sm"
                value={cancelledNote}
                placeholder="说明取消原因"
                onChange={(e) => onCancelledNoteChange(e.target.value)}
              />
            ) : null}
          </span>
        </label>
      </div>
    </div>
  );
}

function validatePastTaskResolution(input: {
  startAt: string;
  endAt: string;
  mode: PastResolutionMode;
  actualCompletedAt: string;
  cancelledNote: string;
}): string | null {
  if (!isTaskRangeFullyPast(input.startAt, input.endAt)) return null;
  if (!input.mode) return "计划区间已全部落在过去，请选择正常完结或中途作废";
  if (input.mode === "completed" && !input.actualCompletedAt.trim()) {
    return "请填写实际完成时间";
  }
  if (input.mode === "cancelled" && !input.cancelledNote.trim()) {
    return "请填写取消备注";
  }
  return null;
}

function AssigneeField({
  id,
  projectId,
  taskId,
  assignees,
  scheduleHref,
  value,
  onChange,
}: {
  id: string;
  projectId?: string;
  taskId?: string;
  assignees: Array<{ id: string; name: string }>;
  scheduleHref: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  if (assignees.length === 0) {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed bg-muted/30 px-2.5 py-2">
        <p className="text-xs text-muted-foreground">
          {scheduleHref ? "请先前往设置资源" : "暂无已投入人员，请联系项目经理安排资源"}
        </p>
        {scheduleHref ? (
          <Link
            href={scheduleHref}
            className="inline-block text-xs text-primary hover:underline"
            onClick={() => {
              if (projectId && taskId) saveScheduleReturn(projectId, taskId);
            }}
          >
            打开资源排班
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <ToneSelect
      id={id}
      name="assigneeId"
      size="sm"
      value={value || "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      options={[
        { value: "__none__", label: "不指定" },
        ...assignees.map((a) => ({ value: a.id, label: a.name })),
      ]}
    />
  );
}

function AddTaskForm({
  disabled,
  phase,
  projectStartKey,
  projectEndKey,
  assignees,
  scheduleHref,
  templateTasks,
  onCancel,
  onSubmit,
  onBatchSubmit,
}: {
  disabled?: boolean;
  phase: PlanPhase;
  projectStartKey: string | null;
  projectEndKey: string | null;
  assignees: Array<{ id: string; name: string }>;
  scheduleHref: string | null;
  templateTasks: Array<{ id: string; name: string; durationDays: number }>;
  onCancel: () => void;
  onSubmit: (input: TaskFormInput & { sourceModelTaskId?: string }) => Promise<TaskFormResult>;
  onBatchSubmit: (
    tasks: Array<{
      name: string;
      plannedStartAt: string;
      plannedEndAt: string;
      sourceModelTaskId?: string;
      status?: ProjectTaskStatus;
      assigneeId?: string;
    }>
  ) => Promise<TaskFormResult>;
}) {
  const phaseStartKey = phase.plannedStartAt ? formatLocalDateInput(phase.plannedStartAt) : null;
  const phaseEndKey = phase.plannedEndAt ? formatLocalDateInput(phase.plannedEndAt) : null;
  const defaults = defaultAddTaskDateRange({
    projectStartKey,
    projectEndKey,
    phaseStartKey,
    phaseEndKey,
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(defaults.startAt);
  const [endAt, setEndAt] = useState(defaults.endAt);
  const [status, setStatus] = useState<ProjectTaskStatus>("NOT_STARTED");
  const [assigneeId, setAssigneeId] = useState("");
  const [templateTaskId, setTemplateTaskId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [pastMode, setPastMode] = useState<PastResolutionMode>("");
  const [actualCompletedAt, setActualCompletedAt] = useState("");
  const [cancelledNote, setCancelledNote] = useState("");
  const [pastReminderOpen, setPastReminderOpen] = useState(false);
  const pastReminderShownRef = useRef(false);

  const fullyPast = isTaskRangeFullyPast(startAt, endAt);

  useEffect(() => {
    if (!fullyPast) {
      setPastMode("");
      setActualCompletedAt("");
      setCancelledNote("");
      pastReminderShownRef.current = false;
      return;
    }
    if (pastReminderShownRef.current) return;
    pastReminderShownRef.current = true;
    setPastReminderOpen(true);
  }, [fullyPast]);

  function applyTemplate(taskId: string) {
    setTemplateTaskId(taskId);
    const template = templateTasks.find((t) => t.id === taskId);
    if (!template) return;
    setName(template.name);
    const base = startAt || defaults.startAt;
    if (!base) return;
    const [y, m, d] = base.split("-").map(Number);
    if (!y || !m || !d) return;
    const start = new Date(y, m - 1, d);
    const end = addCalendarDays(start, template.durationDays);
    if (!startAt) setStartAt(formatLocalDateInput(start));
    setEndAt(formatLocalDateInput(end));
    setFormError(null);
  }

  async function handleBatchTemplates(ids: string[]) {
    setFormError(null);
    setFormWarning(null);
    const base = startAt || defaults.startAt;
    if (!base) {
      setFormError("请先填写计划开始日期，再批量添加模板任务");
      return;
    }
    const [y, m, d] = base.split("-").map(Number);
    if (!y || !m || !d) {
      setFormError("计划开始日期无效");
      return;
    }
    const start = new Date(y, m - 1, d);
    const startKey = formatLocalDateInput(start);
    const batch = ids
      .map((id) => templateTasks.find((t) => t.id === id))
      .filter((t): t is { id: string; name: string; durationDays: number } => Boolean(t))
      .map((template) => ({
        name: template.name,
        plannedStartAt: startKey,
        plannedEndAt: formatLocalDateInput(addCalendarDays(start, template.durationDays)),
        sourceModelTaskId: template.id,
        status,
        assigneeId: assigneeId || undefined,
      }));
    if (batch.length === 0) {
      setFormError("请至少选择一个模板任务");
      return;
    }
    for (const item of batch) {
      if (isTaskRangeFullyPast(item.plannedStartAt, item.plannedEndAt)) {
        setFormError(
          "所选任务计划区间已全部落在过去，请改为逐个添加，并填写完结或取消信息"
        );
        return;
      }
      const local = validateTaskDateRange({
        startAt: item.plannedStartAt,
        endAt: item.plannedEndAt,
        projectStartAt: projectStartKey,
        projectEndAt: projectEndKey,
        phaseStartAt: phaseStartKey,
        phaseEndAt: phaseEndKey,
      });
      if (local.error) {
        setFormError(`${item.name}：${local.error}`);
        return;
      }
      if (local.warning) setFormWarning(local.warning);
    }
    const result = await onBatchSubmit(batch);
    if (result.error) setFormError(result.error);
  }

  function handleNameChange(next: string) {
    setName(next);
    if (!templateTaskId) return;
    const selected = templateTasks.find((t) => t.id === templateTaskId);
    if (!selected || next.trim() !== selected.name) {
      setTemplateTaskId("");
    }
  }

  const canSubmit = Boolean(name.trim() && startAt && endAt);

  async function handleSubmit() {
    setFormError(null);
    setFormWarning(null);
    const pastError = validatePastTaskResolution({
      startAt,
      endAt,
      mode: pastMode,
      actualCompletedAt,
      cancelledNote,
    });
    if (pastError) {
      setFormError(pastError);
      return;
    }
    const local = validateTaskDateRange({
      startAt,
      endAt,
      projectStartAt: projectStartKey,
      projectEndAt: projectEndKey,
      phaseStartAt: phaseStartKey,
      phaseEndAt: phaseEndKey,
    });
    if (local.error) {
      setFormError(local.error);
      return;
    }
    if (local.warning) setFormWarning(local.warning);
    const result = await onSubmit({
      name: name.trim(),
      description,
      plannedStartAt: startAt,
      plannedEndAt: endAt,
      status: pastMode === "completed" ? "COMPLETED" : status,
      assigneeId,
      sourceModelTaskId: templateTaskId || undefined,
      actualCompletedAt: pastMode === "completed" ? actualCompletedAt.trim() : "",
      cancelledNote: pastMode === "cancelled" ? cancelledNote.trim() : "",
    });
    if (result.error) setFormError(result.error);
  }

  return (
    <div className="space-y-3">
      <Dialog open={pastReminderOpen} onOpenChange={setPastReminderOpen}>
        <DialogContent className="max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>当前时间提醒</DialogTitle>
            <DialogDescription>
              该任务的计划开始与计划结束均早于今天。请先选择「正常完结」或「中途作废」，填写对应信息后再保存；未补充前无法保存。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button type="button" size="sm" className="h-8" onClick={() => setPastReminderOpen(false)}>
              我知道了
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`add-task-name-${phase.id}`} className="text-xs">
            任务名称
          </Label>
          {templateTasks.length > 0 ? (
            <TemplateTaskPicker
              templates={templateTasks}
              disabled={disabled}
              onSelect={applyTemplate}
              onBatchSelect={(ids) => void handleBatchTemplates(ids)}
            />
          ) : null}
        </div>
        <Input
          id={`add-task-name-${phase.id}`}
          className="h-8"
          value={name}
          disabled={disabled}
          placeholder="例如：需求访谈"
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">描述（可选）</Label>
        <Textarea
          className="min-h-[60px] text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">计划开始</Label>
          <Input
            className="h-8"
            type="date"
            value={startAt}
            min={projectStartKey ?? undefined}
            onChange={(e) => {
              setStartAt(e.target.value);
              setFormError(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">计划结束</Label>
          <Input
            className="h-8"
            type="date"
            value={endAt}
            min={startAt || projectStartKey || undefined}
            onChange={(e) => {
              setEndAt(e.target.value);
              setFormError(null);
            }}
          />
        </div>
      </div>
      {projectStartKey && projectEndKey ? (
        <p className="text-[11px] text-muted-foreground">
          开始不早于项目计划开始（{projectStartKey}）；结束可晚于项目计划结束（{projectEndKey}
          ，将标记为超期任务）
          {phaseStartKey && phaseEndKey
            ? `；阶段窗口：${phaseStartKey} ~ ${phaseEndKey}`
            : ""}
          {templateTasks.length > 0
            ? "；批量选模板时，各任务按模板工期从「计划开始」起算结束日"
            : ""}
        </p>
      ) : null}
      {fullyPast ? (
        <PastTaskResolutionFields
          mode={pastMode}
          onModeChange={setPastMode}
          actualCompletedAt={actualCompletedAt}
          onActualCompletedAtChange={(v) => {
            setActualCompletedAt(v);
            setFormError(null);
          }}
          cancelledNote={cancelledNote}
          onCancelledNoteChange={(v) => {
            setCancelledNote(v);
            setFormError(null);
          }}
        />
      ) : null}
      {formError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          {formError}
        </p>
      ) : null}
      {formWarning && !formError ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {formWarning}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">状态</Label>
          <ToneSelect
            id={`add-task-status-${phase.id}`}
            name="status"
            size="sm"
            value={pastMode === "completed" ? "COMPLETED" : status}
            onValueChange={(v) => setStatus(v as ProjectTaskStatus)}
            options={TASK_STATUS_OPTIONS}
            disabled={pastMode === "completed"}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">负责人（可选）</Label>
          <AssigneeField
            id={`add-task-assignee-${phase.id}`}
            assignees={assignees}
            scheduleHref={scheduleHref}
            value={assigneeId}
            onChange={setAssigneeId}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={disabled || !canSubmit}
          onClick={() => void handleSubmit()}
        >
          添加
        </Button>
      </div>
    </div>
  );
}

function TemplateTaskPicker({
  templates,
  disabled,
  onSelect,
  onBatchSelect,
}: {
  templates: Array<{ id: string; name: string; durationDays: number }>;
  disabled?: boolean;
  onSelect: (templateId: string) => void;
  onBatchSelect: (templateIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedIds(templates.map((t) => t.id));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelectedIds([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={disabled}
        >
          从模板选择
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-xs text-muted-foreground">可多选后批量添加</p>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={selectAll}
          >
            全选
          </button>
        </div>
        <ul role="listbox" className="max-h-56 overflow-y-auto">
          {templates.map((template) => {
            const checked = selectedIds.includes(template.id);
            return (
              <li key={template.id} role="option" aria-selected={checked}>
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={checked}
                    onChange={() => toggle(template.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{template.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {template.durationDays} 天
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={selectedIds.length !== 1}
            onClick={() => {
              if (selectedIds.length === 1) {
                onSelect(selectedIds[0]);
                setOpen(false);
                setSelectedIds([]);
              }
            }}
          >
            填入表单
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={selectedIds.length === 0 || disabled}
            onClick={() => {
              onBatchSelect(selectedIds);
              setOpen(false);
              setSelectedIds([]);
            }}
          >
            批量添加{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EditTaskForm({
  projectId,
  task,
  phase,
  canEdit,
  projectStartKey,
  projectEndKey,
  assignees,
  scheduleHref,
  disabled,
  onCancel,
  onDelete,
  onSubmit,
}: {
  projectId: string;
  task: PlanTask;
  phase: PlanPhase | null;
  canEdit: boolean;
  projectStartKey: string | null;
  projectEndKey: string | null;
  assignees: Array<{ id: string; name: string }>;
  scheduleHref: string | null;
  disabled?: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onSubmit: (input: TaskFormInput) => Promise<TaskFormResult>;
}) {
  const phaseStartKey = phase?.plannedStartAt ? formatLocalDateInput(phase.plannedStartAt) : null;
  const phaseEndKey = phase?.plannedEndAt ? formatLocalDateInput(phase.plannedEndAt) : null;
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? "");
  const [startAt, setStartAt] = useState(formatLocalDateInput(task.plannedStartAt));
  const [endAt, setEndAt] = useState(formatLocalDateInput(task.plannedEndAt));
  const [status, setStatus] = useState<ProjectTaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [actualCompletedAt, setActualCompletedAt] = useState(
    task.actualCompletedAt ? formatLocalDateInput(task.actualCompletedAt) : ""
  );
  const [cancelledNote, setCancelledNote] = useState(task.cancelledNote ?? "");
  const [pastMode, setPastMode] = useState<PastResolutionMode>(() => {
    if (task.actualCompletedAt) return "completed";
    if (task.cancelledNote) return "cancelled";
    return "";
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [pastReminderOpen, setPastReminderOpen] = useState(false);
  const pastReminderShownRef = useRef(false);

  const fullyPast = isTaskRangeFullyPast(startAt, endAt);
  const overdueFlags = resolveTaskOverdueFlags({
    startKey: startAt || formatLocalDateInput(task.plannedStartAt),
    endKey: endAt || formatLocalDateInput(task.plannedEndAt),
    projectEndKey,
    phaseStartKey,
    phaseEndKey,
  });

  useEffect(() => {
    const draft = loadTaskFormDraft(projectId, task.id);
    if (draft) {
      setName(draft.name);
      setDescription(draft.description);
      setStartAt(draft.plannedStartAt);
      setEndAt(draft.plannedEndAt);
      setStatus(draft.status);
      setAssigneeId(draft.assigneeId);
      setActualCompletedAt(draft.actualCompletedAt ?? "");
      setCancelledNote(draft.cancelledNote ?? "");
      if (draft.actualCompletedAt) setPastMode("completed");
      else if (draft.cancelledNote) setPastMode("cancelled");
    }
    setDraftReady(true);
  }, [projectId, task.id]);

  useEffect(() => {
    if (!fullyPast) {
      if (!task.actualCompletedAt && !task.cancelledNote) {
        setPastMode("");
        setActualCompletedAt("");
        setCancelledNote("");
      }
      return;
    }
    if (!draftReady || pastReminderShownRef.current) return;
    pastReminderShownRef.current = true;
    setPastReminderOpen(true);
  }, [fullyPast, draftReady, task.actualCompletedAt, task.cancelledNote]);

  useEffect(() => {
    if (!canEdit || !draftReady) return;
    saveTaskFormDraft(projectId, task.id, {
      name,
      description,
      plannedStartAt: startAt,
      plannedEndAt: endAt,
      status,
      assigneeId,
      actualCompletedAt: pastMode === "completed" ? actualCompletedAt : "",
      cancelledNote: pastMode === "cancelled" ? cancelledNote : "",
    });
  }, [
    canEdit,
    draftReady,
    projectId,
    task.id,
    name,
    description,
    startAt,
    endAt,
    status,
    assigneeId,
    actualCompletedAt,
    cancelledNote,
    pastMode,
  ]);

  const canSubmit = Boolean(name.trim() && startAt && endAt);

  async function handleSubmit() {
    setFormError(null);
    setFormWarning(null);
    const pastError = validatePastTaskResolution({
      startAt,
      endAt,
      mode: pastMode,
      actualCompletedAt,
      cancelledNote,
    });
    if (pastError) {
      setFormError(pastError);
      return;
    }
    const local = validateTaskDateRange({
      startAt,
      endAt,
      projectStartAt: projectStartKey,
      projectEndAt: projectEndKey,
      phaseStartAt: phaseStartKey,
      phaseEndAt: phaseEndKey,
    });
    if (local.error) {
      setFormError(local.error);
      return;
    }
    if (local.warning) setFormWarning(local.warning);
    const result = await onSubmit({
      name: name.trim(),
      description,
      plannedStartAt: startAt,
      plannedEndAt: endAt,
      status: pastMode === "completed" ? "COMPLETED" : status,
      assigneeId,
      actualCompletedAt: pastMode === "completed" ? actualCompletedAt.trim() : "",
      cancelledNote: pastMode === "cancelled" ? cancelledNote.trim() : "",
    });
    if (result.error) setFormError(result.error);
  }

  if (!canEdit) {
    return (
      <div className="space-y-3 text-sm">
        {overdueFlags.project ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            项目超期：计划结束晚于项目计划结束（{projectEndKey}）。
          </p>
        ) : null}
        {overdueFlags.phase ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            阶段超期：任务时间超出阶段窗口（{phaseStartKey} ~ {phaseEndKey}）。
          </p>
        ) : null}
        {fullyPast ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            当前时间提醒：该任务计划起止均早于今天。
          </p>
        ) : null}
        <div>
          <p className="text-xs text-muted-foreground">任务名称</p>
          <p className="font-medium">
            {task.name}
            {overdueFlags.project ? (
              <span className={cn("ml-2 font-normal", OVERDUE_BADGE_CLASS.project)}>
                {OVERDUE_LABEL.project}
              </span>
            ) : null}
            {overdueFlags.phase ? (
              <span className={cn("ml-2 font-normal", OVERDUE_BADGE_CLASS.phase)}>
                {OVERDUE_LABEL.phase}
              </span>
            ) : null}
          </p>
        </div>
        {task.description ? (
          <div>
            <p className="text-xs text-muted-foreground">描述</p>
            <p className="whitespace-pre-wrap">{task.description}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">计划开始</p>
            <p>{formatLocalDateInput(task.plannedStartAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">计划结束</p>
            <p>{formatLocalDateInput(task.plannedEndAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">状态</p>
            <p>{PROJECT_TASK_STATUS_LABELS[task.status]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">负责人</p>
            <p>{task.assigneeName ?? "未指定"}</p>
          </div>
          {task.actualCompletedAt ? (
            <div>
              <p className="text-xs text-muted-foreground">实际完成时间</p>
              <p>{formatLocalDateInput(task.actualCompletedAt)}</p>
            </div>
          ) : null}
          {task.cancelledNote ? (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">取消备注</p>
              <p className="whitespace-pre-wrap">{task.cancelledNote}</p>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={onCancel}>
            关闭
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Dialog open={pastReminderOpen} onOpenChange={setPastReminderOpen}>
        <DialogContent className="max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>当前时间提醒</DialogTitle>
            <DialogDescription>
              该任务的计划开始与计划结束均早于今天。请先选择「正常完结」或「中途作废」，填写对应信息后再保存；未补充前无法保存。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button type="button" size="sm" className="h-8" onClick={() => setPastReminderOpen(false)}>
              我知道了
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {overdueFlags.project ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          项目超期：计划结束晚于项目计划结束（{projectEndKey}）。
        </p>
      ) : null}
      {overdueFlags.phase ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          阶段超期：任务时间超出阶段窗口（{phaseStartKey} ~ {phaseEndKey}）。
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs">任务名称</Label>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">描述（可选）</Label>
        <Textarea
          className="min-h-[60px] text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">计划开始</Label>
          <Input
            className="h-8"
            type="date"
            value={startAt}
            min={projectStartKey ?? undefined}
            onChange={(e) => {
              setStartAt(e.target.value);
              setFormError(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">计划结束</Label>
          <Input
            className="h-8"
            type="date"
            value={endAt}
            min={startAt || projectStartKey || undefined}
            onChange={(e) => {
              setEndAt(e.target.value);
              setFormError(null);
            }}
          />
        </div>
      </div>
      {projectStartKey && projectEndKey ? (
        <p className="text-[11px] text-muted-foreground">
          开始不早于项目计划开始（{projectStartKey}）；结束可晚于项目计划结束（{projectEndKey}
          ，将标记为超期任务）
          {phaseStartKey && phaseEndKey
            ? `；阶段窗口：${phaseStartKey} ~ ${phaseEndKey}`
            : ""}
        </p>
      ) : null}
      {fullyPast ? (
        <PastTaskResolutionFields
          mode={pastMode}
          onModeChange={setPastMode}
          actualCompletedAt={actualCompletedAt}
          onActualCompletedAtChange={(v) => {
            setActualCompletedAt(v);
            setFormError(null);
          }}
          cancelledNote={cancelledNote}
          onCancelledNoteChange={(v) => {
            setCancelledNote(v);
            setFormError(null);
          }}
        />
      ) : null}
      {formError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          {formError}
        </p>
      ) : null}
      {formWarning && !formError ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {formWarning}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">状态</Label>
          <ToneSelect
            id={`edit-task-status-${task.id}`}
            name="status"
            size="sm"
            value={pastMode === "completed" ? "COMPLETED" : status}
            onValueChange={(v) => setStatus(v as ProjectTaskStatus)}
            options={TASK_STATUS_OPTIONS}
            disabled={pastMode === "completed"}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">负责人（可选）</Label>
          <AssigneeField
            id={`edit-task-assignee-${task.id}`}
            projectId={projectId}
            taskId={task.id}
            assignees={assignees}
            scheduleHref={scheduleHref}
            value={assigneeId}
            onChange={setAssigneeId}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" size="sm" variant="destructive" className="h-8" disabled={disabled} onClick={onDelete}>
          删除
        </Button>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={disabled || !canSubmit}
            onClick={() => void handleSubmit()}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  projectEndKey,
  phaseStartKey,
  phaseEndKey,
  onOpen,
}: {
  task: PlanTask;
  projectEndKey: string | null;
  phaseStartKey: string | null;
  phaseEndKey: string | null;
  onOpen: () => void;
}) {
  const startKey = formatLocalDateInput(task.plannedStartAt);
  const endKey = formatLocalDateInput(task.plannedEndAt);
  const bounds = { projectEndKey, phaseStartKey, phaseEndKey };
  const flags = resolveTaskOverdueFlags({ startKey, endKey, ...bounds });
  const startLevel = resolveDateOverdueLevel(startKey, bounds);
  const endLevel = resolveDateOverdueLevel(endKey, bounds);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{task.name}</span>
        <span className="flex shrink-0 items-center gap-1">
          {flags.project ? (
            <span className={OVERDUE_BADGE_CLASS.project}>{OVERDUE_LABEL.project}</span>
          ) : null}
          {flags.phase ? (
            <span className={OVERDUE_BADGE_CLASS.phase}>{OVERDUE_LABEL.phase}</span>
          ) : null}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {PROJECT_TASK_STATUS_LABELS[task.status]}
          </span>
        </span>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        <span className={startLevel ? OVERDUE_DATE_CLASS[startLevel] : undefined}>{startKey}</span>
        <span className="text-muted-foreground"> ~ </span>
        <span className={endLevel ? OVERDUE_DATE_CLASS[endLevel] : undefined}>{endKey}</span>
        {task.assigneeName ? ` · ${task.assigneeName}` : " · 未指定负责人"}
      </p>
    </button>
  );
}

function ProjectPlanGantt({
  projectStart,
  totalDays,
  phases,
  expandedPhaseIds,
  selectedPhaseId,
  onSelectPhase,
}: {
  projectStart: Date | null;
  totalDays: number;
  phases: PlanPhase[];
  expandedPhaseIds: Set<string>;
  selectedPhaseId: string | null;
  onSelectPhase: (id: string) => void;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const update = () => setPaneWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [projectStart, totalDays]);

  if (!projectStart || totalDays <= 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-md border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
        请先在「概览」中设置项目计划开始与计划结束日期，甘特图将在此显示。
      </div>
    );
  }

  const available = Math.max(0, paneWidth - GANTT_LABEL_WIDTH);
  const natural = totalDays * DAY_WIDTH;
  const dayWidth =
    paneWidth > 0 && available > natural
      ? Math.max(DAY_WIDTH, Math.floor(available / totalDays))
      : DAY_WIDTH;

  const days = eachCalendarDay(projectStart, addCalendarDays(projectStart, totalDays));
  const timelineWidth = totalDays * dayWidth;
  const monthBands = buildGanttMonthBands(days);

  return (
    <div
      ref={paneRef}
      className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-md border"
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: GANTT_LABEL_WIDTH + timelineWidth, minWidth: "100%" }}>
          <div className="sticky top-0 z-10 flex border-b bg-muted/40 text-[10px] text-muted-foreground">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-muted/40 px-2 text-xs"
              style={{ width: GANTT_LABEL_WIDTH }}
            >
              阶段 / 任务
            </div>
            <div className="flex shrink-0 flex-col" style={{ width: timelineWidth }}>
              <div className="flex h-5 border-b border-border/50">
                {monthBands.map((band) => (
                  <div
                    key={band.key}
                    className="box-border flex shrink-0 items-center overflow-hidden border-r border-border/40 px-1 font-medium text-foreground/80"
                    style={{ width: band.dayCount * dayWidth }}
                    title={band.label}
                  >
                    <span className="whitespace-nowrap">{band.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex h-5 text-[9px]">
                {days.map((date, i) => (
                  <div
                    key={i}
                    className="box-border flex shrink-0 items-center justify-center overflow-hidden border-r border-border/30 leading-none"
                    style={{ width: dayWidth }}
                    title={formatLocalDateInput(date)}
                  >
                    <span className="tabular-nums">{date.getDate()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            {phases.map((phase) => {
              const expanded = expandedPhaseIds.has(phase.id);
              const hasDates = Boolean(phase.plannedStartAt && phase.plannedEndAt);
              const startDay = hasDates ? dayIndex(toDateOnly(phase.plannedStartAt as Date), projectStart) : null;
              const endDay = hasDates ? dayIndex(toDateOnly(phase.plannedEndAt as Date), projectStart) : null;
              const orderedTasks = sortByOrder(phase.tasks);
              const phaseBar = hasDates && startDay != null && endDay != null
                ? ganttBarStyle(startDay, endDay, totalDays, dayWidth)
                : null;
              return (
                <div key={phase.id}>
                  <div
                    className={cn(
                      "flex min-h-[40px] w-full border-b",
                      selectedPhaseId === phase.id && "bg-primary/5"
                    )}
                  >
                    <div
                      className="sticky left-0 z-[2] shrink-0 truncate border-r bg-card px-2 py-2 text-xs"
                      style={{ width: GANTT_LABEL_WIDTH }}
                      title={phase.name}
                    >
                      {phase.name}
                    </div>
                    <div className="relative shrink-0" style={{ width: timelineWidth }}>
                      {phaseBar ? (
                        <button
                          type="button"
                          className="absolute top-2 z-[1] h-6 min-w-[8px] truncate rounded-sm bg-primary px-1.5 text-[10px] leading-6 text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                          style={phaseBar}
                          title={`${phase.name} · ${formatLocalDateInput(phase.plannedStartAt as Date)} ~ ${formatLocalDateInput(phase.plannedEndAt as Date)}`}
                          onClick={() => onSelectPhase(phase.id)}
                        >
                          {phase.name}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="absolute left-2 top-2.5 text-[11px] text-muted-foreground hover:underline"
                          onClick={() => onSelectPhase(phase.id)}
                        >
                          未设置日期
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded
                    ? orderedTasks.map((task) => {
                        const tStartDay = dayIndex(toDateOnly(task.plannedStartAt), projectStart);
                        const tEndDay = dayIndex(toDateOnly(task.plannedEndAt), projectStart);
                        const outOfPhaseWindow =
                          hasDates && startDay != null && endDay != null
                            ? tStartDay < startDay || tEndDay > endDay
                            : false;
                        const taskBar = ganttBarStyle(tStartDay, tEndDay, totalDays, dayWidth);
                        return (
                          <div key={task.id} className="flex min-h-[32px] w-full border-b bg-muted/5">
                            <div
                              className="sticky left-0 z-[2] shrink-0 truncate border-r bg-muted/5 px-2 py-1.5 pl-6 text-[11px] text-muted-foreground"
                              style={{ width: GANTT_LABEL_WIDTH }}
                              title={task.name}
                            >
                              {task.name}
                            </div>
                            <div className="relative shrink-0" style={{ width: timelineWidth }}>
                              <div
                                className={cn(
                                  "absolute top-1.5 h-4 min-w-[6px] truncate rounded-sm px-1 text-[9px] leading-4",
                                  outOfPhaseWindow
                                    ? "border border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                    : "bg-sky-500 text-white"
                                )}
                                style={taskBar}
                                title={`${task.name} · ${formatLocalDateInput(task.plannedStartAt)} ~ ${formatLocalDateInput(task.plannedEndAt)}${
                                  outOfPhaseWindow ? " · 超出阶段计划窗口" : ""
                                }`}
                              >
                                {task.name}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
