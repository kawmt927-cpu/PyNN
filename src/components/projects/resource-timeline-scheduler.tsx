"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/opportunities/funnel";
import {
  DAY_COLUMN_WIDTH,
  barStyleForRange,
  buildTimelineDays,
  datesFromWeekDrop,
  getWeekPeriod,
  weekNavigationHref,
  type TimelineDay,
} from "@/lib/projects/timeline";
import { projectColorClass } from "@/lib/projects/timeline-colors";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import type {
  ScheduleBar,
  SchedulePersonRow,
  ScheduleStaff,
} from "@/lib/projects/schedule-serialize";
import type { AllocationRecord } from "@/lib/projects/allocation-split";
import { AllocationEditDialog } from "@/components/projects/allocation-edit-dialog";
import { createProjectAllocationFromDrag } from "@/app/(dashboard)/projects/allocation-actions";

export type SchedulerViewMode = "project" | "global";

type Props = {
  mode: SchedulerViewMode;
  weekStart: string;
  canEdit: boolean;
  staff: ScheduleStaff[];
  /** project mode */
  projectId?: string;
  projectName?: string;
  bars?: ScheduleBar[];
  /** global mode */
  rows?: SchedulePersonRow[];
  basePath: string;
  peerRecordsByUser?: Record<string, AllocationRecord[]>;
};

function StaffCard({
  staff,
  disabled,
}: {
  staff: ScheduleStaff;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: { type: "staff", userId: staff.id },
    disabled: disabled || staff.dailyRate == null,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-md border bg-card p-2 text-xs shadow-sm",
        staff.dailyRate == null ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60"
      )}
    >
      <p className="font-medium">{staff.name}</p>
      <p className="text-muted-foreground">
        {staff.dailyRate != null ? `${formatAmount(staff.dailyRate)}/天` : "未设日单价"}
      </p>
      <p className="text-muted-foreground">
        本周 {staff.weekEffectiveDays} 人天 · {staff.parallelProjects} 项目
      </p>
      {staff.weekLoadPercent > 100 ? (
        <p className="text-destructive">{staff.weekLoadPercent}% 负载</p>
      ) : null}
    </div>
  );
}

function TimelineBar({
  bar,
  weekStart,
  days,
  showProject,
  onSelect,
}: {
  bar: ScheduleBar;
  weekStart: Date;
  days: TimelineDay[];
  showProject: boolean;
  onSelect: () => void;
}) {
  const style = barStyleForRange(
    new Date(bar.startDate),
    new Date(bar.endDate),
    weekStart,
    days.length
  );
  if (!style.visible) return null;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${bar.userName}${showProject ? ` · ${bar.projectName}` : ""} · ${bar.effectiveDays} 人天`}
      className={cn(
        "absolute top-1 bottom-1 min-w-[24px] rounded px-1 text-left text-[10px] leading-tight text-white shadow",
        projectColorClass(bar.projectId),
        "hover:brightness-110"
      )}
      style={{ left: style.left, width: style.width }}
    >
      <span className="block truncate font-medium">
        {showProject ? bar.projectName : bar.userName}
      </span>
      <span className="opacity-90">
        {bar.effectiveDays}d · {ALLOCATION_MODE_LABELS[bar.allocationMode]}
      </span>
    </button>
  );
}

function DropTimelineRow({
  rowId,
  weekStart,
  days,
  bars,
  showProject,
  label,
  sublabel,
  canDrop,
  onSelectBar,
}: {
  rowId: string;
  weekStart: Date;
  days: TimelineDay[];
  bars: ScheduleBar[];
  showProject: boolean;
  label: string;
  sublabel?: string;
  canDrop: boolean;
  onSelectBar: (bar: ScheduleBar) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: rowId,
    data: { type: "timeline-row" },
    disabled: !canDrop,
  });

  return (
    <div className="flex border-b">
      <div className="w-40 shrink-0 border-r p-2 text-xs">
        <p className="font-medium truncate">{label}</p>
        {sublabel ? <p className="text-muted-foreground truncate">{sublabel}</p> : null}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex-1 min-h-[52px]",
          isOver && canDrop && "bg-primary/5 ring-1 ring-inset ring-primary/30"
        )}
        style={{ minWidth: days.length * DAY_COLUMN_WIDTH }}
      >
        <div className="absolute inset-0 flex pointer-events-none">
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "border-r border-dashed border-border/60 h-full",
                day.isWeekend && "bg-muted/40"
              )}
              style={{ width: DAY_COLUMN_WIDTH }}
            />
          ))}
        </div>
        <div className="absolute inset-0">
          {bars.map((bar) => (
            <TimelineBar
              key={bar.id}
              bar={bar}
              weekStart={weekStart}
              days={days}
              showProject={showProject}
              onSelect={() => onSelectBar(bar)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResourceTimelineScheduler({
  mode,
  weekStart: weekStartIso,
  canEdit,
  staff,
  projectId,
  projectName,
  bars = [],
  rows = [],
  basePath,
  peerRecordsByUser = {},
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeStaffId, setActiveStaffId] = useState<string | null>(null);
  const [selectedBar, setSelectedBar] = useState<ScheduleBar | null>(null);

  const weekStart = useMemo(() => new Date(weekStartIso), [weekStartIso]);
  const days = useMemo(() => buildTimelineDays(getWeekPeriod(weekStart)), [weekStart]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const activeStaff = staff.find((s) => s.id === activeStaffId);

  function handleDragEnd(event: DragEndEvent) {
    setActiveStaffId(null);
    const { active, over } = event;
    if (!over || !canEdit) return;

    const userId =
      active.data.current?.type === "staff"
        ? (active.data.current.userId as string)
        : String(active.id).replace("staff-", "");

    if (over.data.current?.type !== "timeline-row") return;
    if (!projectId) {
      setError("全局视图请进入具体项目添加投入，或从项目详情排班页拖拽");
      return;
    }

    const { startDate, endDate } = datesFromWeekDrop(weekStart);
    setError(null);
    startTransition(async () => {
      const result = await createProjectAllocationFromDrag({
        projectId,
        userId,
        startDate,
        endDate,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const peerRecordsForSelected = selectedBar
    ? peerRecordsByUser[selectedBar.userId] ?? []
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={weekNavigationHref(basePath, weekStart, -1)}>上一周</Link>
          </Button>
          <span className="text-sm font-medium">
            {formatLocalDateInput(days[0].date)} – {formatLocalDateInput(days[days.length - 1].date)}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href={weekNavigationHref(basePath, weekStart, 1)}>下一周</Link>
          </Button>
        </div>
        {mode === "project" && projectName ? (
          <p className="text-sm text-muted-foreground">当前项目：{projectName}</p>
        ) : null}
        {mode === "global" ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/projects">返回项目列表</Link>
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        从左侧人员池拖拽到时间轴即可添加 AUTO 投入（默认本周工作日）。点击色块编辑或删除；多人多项目时系统自动等比例拆分。
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pending ? <p className="text-sm text-muted-foreground">保存中…</p> : null}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          if (String(e.active.id).startsWith("staff-")) {
            setActiveStaffId(String(e.active.id).replace("staff-", ""));
          }
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveStaffId(null)}
      >
        <div className="flex rounded-md border overflow-hidden">
          <div className="w-40 shrink-0 border-r bg-muted/20">
            <div className="border-b p-2 text-xs font-medium text-muted-foreground h-[41px] flex items-center">
              人员池
            </div>
            <div className="max-h-[480px] overflow-y-auto p-2 space-y-2">
              {staff.map((member) => (
                <StaffCard key={member.id} staff={member} disabled={!canEdit} />
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <div
              className="flex border-b bg-muted/30 text-xs text-muted-foreground"
              style={{ minWidth: days.length * DAY_COLUMN_WIDTH + 160 }}
            >
              <div className="w-40 shrink-0 border-r p-2 font-medium">
                {mode === "global" ? "人员 / 负载" : "投入"}
              </div>
              <div className="flex">
                {days.map((day) => (
                  <div
                    key={day.dateKey}
                    className={cn(
                      "border-r p-1 text-center",
                      day.isWeekend && "bg-muted/50"
                    )}
                    style={{ width: DAY_COLUMN_WIDTH }}
                  >
                    {day.label}
                  </div>
                ))}
              </div>
            </div>

            {mode === "project" ? (
              <DropTimelineRow
                rowId="project-timeline"
                weekStart={weekStart}
                days={days}
                bars={bars}
                showProject={false}
                label={projectName ?? "本项目"}
                sublabel={`${bars.length} 条投入`}
                canDrop={canEdit && Boolean(projectId)}
                onSelectBar={setSelectedBar}
              />
            ) : (
              rows.map((row) => (
                <DropTimelineRow
                  key={row.userId}
                  rowId={`person-${row.userId}`}
                  weekStart={weekStart}
                  days={days}
                  bars={row.bars}
                  showProject
                  label={row.userName}
                  sublabel={`${row.weekEffectiveDays} 人天 · ${row.weekLoadPercent}%`}
                  canDrop={false}
                  onSelectBar={setSelectedBar}
                />
              ))
            )}

            {mode === "global" && rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">本周暂无排班记录。</p>
            ) : null}
          </div>
        </div>

        <DragOverlay>
          {activeStaff ? (
            <div className="rounded-md border bg-card p-2 text-xs shadow-lg w-36">
              <p className="font-medium">{activeStaff.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedBar ? (
        <AllocationEditDialog
          bar={selectedBar}
          projectId={selectedBar.projectId}
          canEdit={canEdit}
          peerRecords={peerRecordsForSelected}
          onClose={() => setSelectedBar(null)}
          onDeleted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
