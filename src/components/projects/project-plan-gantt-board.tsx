"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addDays, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { toDateOnly } from "@/lib/projects/workdays";
import { resolveTaskProgressPercent } from "@/lib/projects/task-progress";
import {
  PROJECT_TASK_STATUS_BAR_CLASS,
  PROJECT_TASK_STATUS_LABELS,
} from "@/lib/projects/labels";
import {
  buildPlanGanttDays,
  buildPlanGanttHeaderBands,
  planGanttDayWidth,
  resolvePhaseGanttBarRange,
  resolvePlanGanttFocusAnchor,
  resolvePlanGanttPeriod,
  shiftPlanGanttAnchor,
  SCHEDULE_CUSTOM_MAX_DAYS,
  type PlanGanttRangeMode,
} from "@/lib/projects/plan-gantt-range";
import { updateProjectTask } from "@/app/(dashboard)/projects/project-plan-actions";
import type { PlanPhase, PlanTask } from "@/components/projects/project-plan-types";
import { usePropagateWheelAtEdge } from "@/hooks/use-propagate-wheel-at-edge";

const LABEL_WIDTH = 168;

type Props = {
  projectId: string;
  canEdit: boolean;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  /** 项目资源投入最晚结束日；用于日/周/月切换定位 */
  allocationSpanEnd?: Date | string | null;
  phases: PlanPhase[];
  expandedPhaseIds: Set<string>;
  selectedPhaseId: string | null;
  selectedTaskId: string | null;
  onSelectPhase: (phaseId: string) => void;
  onSelectTask: (taskId: string | null) => void;
  onTogglePhaseExpanded: (phaseId: string) => void;
  onError?: (message: string | null) => void;
  onWarning?: (message: string | null) => void;
  /** 未填计划起止时拦截拖拽改期等编辑操作 */
  runWithPlannedWindow?: (action: () => void) => void;
  onRefresh?: () => void;
};

function sortByOrder<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function barStyle(startIdx: number, endIdx: number, totalDays: number, dayWidth: number) {
  const start = clamp(startIdx, 0, totalDays - 1);
  const end = clamp(Math.max(endIdx, start), 0, totalDays - 1);
  return {
    left: start * dayWidth,
    width: Math.max(end - start + 1, 1) * dayWidth,
  };
}

function dayIndexFromDate(date: Date, rangeStart: Date): number {
  return Math.round(
    (toDateOnly(date).getTime() - toDateOnly(rangeStart).getTime()) / 86_400_000
  );
}

function taskBarClass(task: PlanTask, selected: boolean) {
  const cancelled = Boolean(task.cancelledNote?.trim());
  if (cancelled) {
    return cn(
      "border border-muted-foreground/40 bg-muted text-muted-foreground",
      selected && "ring-2 ring-primary ring-offset-1"
    );
  }
  return cn(
    PROJECT_TASK_STATUS_BAR_CLASS[task.status],
    selected && "ring-2 ring-primary ring-offset-1"
  );
}

type DragState = {
  taskId: string;
  mode: "move" | "resize-start" | "resize-end";
  originX: number;
  originStart: Date;
  originEnd: Date;
  previewStart: Date;
  previewEnd: Date;
};

export function ProjectPlanGanttBoard({
  projectId,
  canEdit,
  plannedStartAt,
  plannedEndAt,
  allocationSpanEnd = null,
  phases,
  expandedPhaseIds,
  selectedPhaseId,
  selectedTaskId,
  onSelectPhase,
  onSelectTask,
  onTogglePhaseExpanded,
  onError,
  onWarning,
  runWithPlannedWindow,
  onRefresh,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<PlanGanttRangeMode>("day");
  const focusAnchor = useMemo(
    () =>
      resolvePlanGanttFocusAnchor({
        allocationSpanEnd,
        taskEnds: phases.flatMap((phase) =>
          phase.tasks.map((task) => task.plannedEndAt)
        ),
        plannedEnd: plannedEndAt,
        plannedStart: plannedStartAt,
      }),
    [allocationSpanEnd, phases, plannedEndAt, plannedStartAt]
  );
  const [anchor, setAnchor] = useState(focusAnchor);
  const [customStart, setCustomStart] = useState(
    plannedStartAt ? formatLocalDateInput(plannedStartAt) : ""
  );
  const [customEnd, setCustomEnd] = useState(
    plannedEndAt ? formatLocalDateInput(plannedEndAt) : ""
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const shouldScrollToFocusRef = useRef(true);
  usePropagateWheelAtEdge(paneRef);

  const period = useMemo(
    () =>
      resolvePlanGanttPeriod({
        mode,
        projectStart: plannedStartAt ? toDateOnly(plannedStartAt) : null,
        projectEnd: plannedEndAt ? toDateOnly(plannedEndAt) : null,
        customStart: customStart || null,
        customEnd: customEnd || null,
        anchor,
      }),
    [mode, plannedStartAt, plannedEndAt, customStart, customEnd, anchor]
  );

  const days = useMemo(
    () => (period ? buildPlanGanttDays(period.from, period.to) : []),
    [period]
  );
  const dayWidth = planGanttDayWidth(mode, days.length || 1);
  const bands = useMemo(
    () => (period ? buildPlanGanttHeaderBands(days, period.mode) : []),
    [days, period]
  );
  const timelineWidth = days.length * dayWidth;
  const sortedPhases = useMemo(() => sortByOrder(phases), [phases]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const el = rowRefs.current.get(selectedTaskId);
    if (!el) return;
    const pane = paneRef.current;
    if (pane) {
      const er = el.getBoundingClientRect();
      const pr = pane.getBoundingClientRect();
      if (er.top >= pr.top && er.bottom <= pr.bottom) return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [selectedTaskId]);

  // 日视图跨整个项目时，切换到日后滚到「最新投入」附近，避免停在计划开始月
  useEffect(() => {
    if (!shouldScrollToFocusRef.current) return;
    if (mode !== "day" || !period || !paneRef.current || days.length === 0) return;
    shouldScrollToFocusRef.current = false;
    const idx = dayIndexFromDate(focusAnchor, period.from);
    if (idx < 0 || idx >= days.length) return;
    const target = LABEL_WIDTH + idx * dayWidth - Math.max(paneRef.current.clientWidth * 0.35, 120);
    paneRef.current.scrollLeft = Math.max(0, target);
  }, [mode, period, days.length, dayWidth, focusAnchor]);

  function switchMode(next: PlanGanttRangeMode) {
    shouldScrollToFocusRef.current = next === "day";
    setMode(next);
    if (next === "week" || next === "month") {
      setAnchor(focusAnchor);
    }
  }

  useEffect(() => {
    if (!drag) return;

    function onMove(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const deltaDays = Math.round((event.clientX - current.originX) / dayWidth);
      let nextStart = current.originStart;
      let nextEnd = current.originEnd;
      if (current.mode === "move") {
        nextStart = addDays(current.originStart, deltaDays);
        nextEnd = addDays(current.originEnd, deltaDays);
      } else if (current.mode === "resize-start") {
        nextStart = addDays(current.originStart, deltaDays);
        if (nextStart.getTime() > nextEnd.getTime()) nextStart = nextEnd;
      } else {
        nextEnd = addDays(current.originEnd, deltaDays);
        if (nextEnd.getTime() < nextStart.getTime()) nextEnd = nextStart;
      }
      const next: DragState = {
        ...current,
        previewStart: toDateOnly(nextStart),
        previewEnd: toDateOnly(nextEnd),
      };
      dragRef.current = next;
      setDrag(next);
    }

    function onUp() {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current) return;
      const startKey = formatLocalDateInput(current.previewStart);
      const endKey = formatLocalDateInput(current.previewEnd);
      const originStartKey = formatLocalDateInput(current.originStart);
      const originEndKey = formatLocalDateInput(current.originEnd);
      if (startKey === originStartKey && endKey === originEndKey) return;
      onError?.(null);
      onWarning?.(null);
      startTransition(async () => {
        const result = await updateProjectTask({
          projectId,
          taskId: current.taskId,
          plannedStartAt: startKey,
          plannedEndAt: endKey,
        });
        if (result.error) {
          onError?.(result.error);
          return;
        }
        if (result.warning) onWarning?.(result.warning);
        onRefresh?.();
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // 仅在开始/结束拖拽时绑定；预览更新走 dragRef，避免每帧重绑
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag 对象变化不重绑
  }, [drag != null, dayWidth, projectId, onError, onWarning, onRefresh]);

  function beginDrag(
    event: React.PointerEvent,
    task: PlanTask,
    dragMode: DragState["mode"]
  ) {
    if (!canEdit || pending) return;
    const start = () => {
      event.preventDefault();
      event.stopPropagation();
      onSelectTask(task.id);
      const next: DragState = {
        taskId: task.id,
        mode: dragMode,
        originX: event.clientX,
        originStart: toDateOnly(task.plannedStartAt),
        originEnd: toDateOnly(task.plannedEndAt),
        previewStart: toDateOnly(task.plannedStartAt),
        previewEnd: toDateOnly(task.plannedEndAt),
      };
      dragRef.current = next;
      setDrag(next);
    };
    if (runWithPlannedWindow) runWithPlannedWindow(start);
    else start();
  }

  if (!period || days.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        请先在「概览」中设置项目计划起止日期，或选择「自定义」区间查看甘特。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border">
          {(
            [
              ["day", "日"],
              ["week", "周"],
              ["month", "月"],
              ["custom", "自定义"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "px-2.5 py-1 text-xs",
                mode === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
              onClick={() => switchMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "week" || mode === "month" ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setAnchor((prev) => shiftPlanGanttAnchor(mode, prev, -1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[7rem] text-center text-xs text-muted-foreground">
              {mode === "week"
                ? `${format(period.from, "M/d", { locale: zhCN })}–${format(period.to, "M/d", { locale: zhCN })}`
                : format(period.from, "yyyy年M月", { locale: zhCN })}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setAnchor((prev) => shiftPlanGanttAnchor(mode, prev, 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
        {mode === "custom" ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Input
              type="date"
              className="h-7 w-[10.5rem]"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="shrink-0 text-muted-foreground">至</span>
            <Input
              type="date"
              className="h-7 w-[10.5rem]"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
            <span className="text-muted-foreground">最多 {SCHEDULE_CUSTOM_MAX_DAYS} 天</span>
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {(
              [
                "NOT_STARTED",
                "IN_PROGRESS",
                "TESTING",
                "WAITING",
                "PAUSED",
                "COMPLETED",
              ] as const
            ).map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-2.5 w-2.5 rounded-sm",
                    PROJECT_TASK_STATUS_BAR_CLASS[status]
                  )}
                />
                {PROJECT_TASK_STATUS_LABELS[status]}
              </span>
            ))}
        </div>
      </div>

      <div
        ref={paneRef}
        className="max-h-[min(52vh,480px)] overflow-auto rounded-md border"
      >
        <div style={{ width: LABEL_WIDTH + timelineWidth, minWidth: "100%" }}>
          <div className="sticky top-0 z-30 flex border-b bg-muted text-[10px] text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center border-r bg-muted px-2 text-xs"
              style={{ width: LABEL_WIDTH }}
            >
              阶段 / 任务
            </div>
            <div className="flex shrink-0 flex-col bg-muted" style={{ width: timelineWidth }}>
              <div className="flex h-5 border-b border-border/50">
                {bands.map((band) => (
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
                {days.map((day) => (
                  <div
                    key={day.dateKey}
                    className={cn(
                      "box-border flex shrink-0 items-center justify-center overflow-hidden border-r border-border/30 leading-none",
                      day.isWeekend && "bg-black/[0.06] dark:bg-white/[0.08]"
                    )}
                    style={{ width: dayWidth }}
                    title={day.dateKey}
                  >
                    <span className="tabular-nums">
                      {mode === "day" || days.length <= 60
                        ? day.date.getDate()
                        : day.date.getDate() === 1
                          ? day.date.getDate()
                          : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            {sortedPhases.map((phase) => {
              const expanded = expandedPhaseIds.has(phase.id);
              const orderedTasks = sortByOrder(phase.tasks);
              const phaseRange = resolvePhaseGanttBarRange({
                plannedStartAt: phase.plannedStartAt,
                plannedEndAt: phase.plannedEndAt,
                tasks: orderedTasks.map((task) => {
                  if (drag?.taskId === task.id) {
                    return {
                      plannedStartAt: drag.previewStart,
                      plannedEndAt: drag.previewEnd,
                    };
                  }
                  return {
                    plannedStartAt: task.plannedStartAt,
                    plannedEndAt: task.plannedEndAt,
                  };
                }),
              });
              const phaseBar = phaseRange
                ? barStyle(
                    dayIndexFromDate(phaseRange.start, period.from),
                    dayIndexFromDate(phaseRange.end, period.from),
                    days.length,
                    dayWidth
                  )
                : null;

              return (
                <div key={phase.id}>
                  <div
                    className={cn(
                      "flex min-h-[40px] w-full border-b",
                      selectedPhaseId === phase.id
                        ? "bg-primary/15 shadow-[inset_3px_0_0_0] shadow-primary hover:bg-primary/20"
                        : "hover:bg-muted/30"
                    )}
                  >
                    <div
                      className="sticky left-0 z-[2] flex shrink-0 items-center gap-0.5 border-r bg-card px-1 py-2 text-xs"
                      style={{ width: LABEL_WIDTH }}
                    >
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 hover:bg-muted disabled:opacity-30"
                        disabled={orderedTasks.length === 0}
                        onClick={() => onTogglePhaseExpanded(phase.id)}
                        title={expanded ? "收起任务" : "展开任务"}
                      >
                        {orderedTasks.length === 0 ? (
                          <span className="inline-block w-3.5" />
                        ) : expanded ? (
                          <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left hover:underline"
                        title={phase.name}
                        onClick={() => onSelectPhase(phase.id)}
                      >
                        {phase.name}
                      </button>
                    </div>
                    <div className="relative shrink-0" style={{ width: timelineWidth }}>
                      {phaseRange ? (
                        <button
                          type="button"
                          className="absolute top-2 z-[1] h-6 min-w-[8px] truncate rounded-sm bg-slate-500 px-1.5 text-[10px] leading-6 text-white shadow-sm"
                          style={phaseBar!}
                          title={`${phase.name} · ${formatLocalDateInput(phaseRange.start)} ~ ${formatLocalDateInput(phaseRange.end)}`}
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
                        const isDragging = drag?.taskId === task.id;
                        const startDate = isDragging
                          ? drag.previewStart
                          : toDateOnly(task.plannedStartAt);
                        const endDate = isDragging
                          ? drag.previewEnd
                          : toDateOnly(task.plannedEndAt);
                        const tStart = dayIndexFromDate(startDate, period.from);
                        const tEnd = dayIndexFromDate(endDate, period.from);
                        const taskBar = barStyle(tStart, tEnd, days.length, dayWidth);
                        const progress = resolveTaskProgressPercent(task);
                        const selected = selectedTaskId === task.id;

                        return (
                          <div
                            key={task.id}
                            ref={(el) => {
                              if (el) rowRefs.current.set(task.id, el);
                              else rowRefs.current.delete(task.id);
                            }}
                            className={cn(
                              "flex min-h-[32px] w-full border-b",
                              selected
                                ? "bg-primary/15 shadow-[inset_3px_0_0_0] shadow-primary hover:bg-primary/20"
                                : "bg-background hover:bg-muted/30"
                            )}
                          >
                            <button
                              type="button"
                              className={cn(
                                "sticky left-0 z-[2] shrink-0 truncate border-r px-2 py-1.5 pl-7 text-left text-[11px] hover:underline",
                                selected
                                  ? "bg-primary/15 font-medium text-primary"
                                  : "bg-background text-muted-foreground"
                              )}
                              style={{ width: LABEL_WIDTH }}
                              title={task.name}
                              onClick={() => {
                                onSelectPhase(phase.id);
                                onSelectTask(task.id);
                              }}
                            >
                              {task.name}
                            </button>
                            <div className="relative shrink-0" style={{ width: timelineWidth }}>
                              <div
                                className={cn(
                                  "absolute top-1.5 z-[1] flex h-5 min-w-[6px] items-center overflow-hidden rounded-sm text-[9px] leading-5",
                                  taskBarClass(task, selected),
                                  canEdit && "cursor-grab active:cursor-grabbing"
                                )}
                                style={taskBar}
                                title={`${task.name} · ${formatLocalDateInput(startDate)} ~ ${formatLocalDateInput(endDate)} · ${PROJECT_TASK_STATUS_LABELS[task.status]} · ${progress}%`}
                                onClick={() => {
                                  onSelectPhase(phase.id);
                                  onSelectTask(task.id);
                                }}
                                onPointerDown={(e) => beginDrag(e, task, "move")}
                              >
                                {canEdit ? (
                                  <span
                                    className="absolute left-0 top-0 z-[1] h-full w-1.5 cursor-ew-resize bg-black/20"
                                    onPointerDown={(e) => beginDrag(e, task, "resize-start")}
                                  />
                                ) : null}
                                <span className="truncate px-1.5">
                                  {task.name}
                                  {progress > 0 ? ` ${progress}%` : ""}
                                </span>
                                {canEdit ? (
                                  <span
                                    className="absolute right-0 top-0 z-[1] h-full w-1.5 cursor-ew-resize bg-black/20"
                                    onPointerDown={(e) => beginDrag(e, task, "resize-end")}
                                  />
                                ) : null}
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
