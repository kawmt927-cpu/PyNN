"use client";

import { useId, useMemo, useState } from "react";
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
  formatPersonDays,
  weekNavigationHref,
  type TimelineDay,
} from "@/lib/projects/timeline";
import { staffColorClass } from "@/lib/projects/timeline-colors";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import type {
  ScheduleBar,
  SchedulePersonRow,
  ScheduleStaff,
} from "@/lib/projects/schedule-serialize";
import { buildDraftScheduleBar } from "@/lib/projects/schedule-serialize";
import { getDailyShares, type AllocationRecord } from "@/lib/projects/allocation-split";
import { AllocationEditDialog } from "@/components/projects/allocation-edit-dialog";
import { findOverlappingSegment } from "@/lib/projects/allocation-overlap";
import { parseDateOnlyInput } from "@/lib/validations/project";
import { toDateOnly } from "@/lib/projects/workdays";

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
        {staff.dailyRate != null ? `${formatAmount(staff.dailyRate)}/天` : "未设月成本"}
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

function clampShare(share: number): number {
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.min(share, 1);
}

function fillHeightPct(share: number): number {
  return Math.max(share * 100, share > 0 ? 6 : 0);
}

function dayFillCornerClass(
  heightPct: number,
  prevHeightPct: number | null,
  nextHeightPct: number | null
): string {
  // 台阶拐角只圆「更高」一侧，避免矮块贴高块时出现内凹缺口
  const roundTl = prevHeightPct == null || heightPct > prevHeightPct;
  const roundTr = nextHeightPct == null || heightPct > nextHeightPct;
  const roundBl = prevHeightPct == null;
  const roundBr = nextHeightPct == null;
  return cn(
    roundTl && "rounded-tl",
    roundTr && "rounded-tr",
    roundBl && "rounded-bl",
    roundBr && "rounded-br"
  );
}

function asDateOnly(value: Date | string): Date {
  if (value instanceof Date) return toDateOnly(value);
  return toDateOnly(parseDateOnlyInput(String(value).slice(0, 10)));
}

function normalizePeerRecords(records: AllocationRecord[]): AllocationRecord[] {
  return records.map((record) => ({
    ...record,
    startDate: asDateOnly(record.startDate),
    endDate: asDateOnly(record.endDate),
  }));
}

function dayFillsForBar(
  bar: ScheduleBar,
  days: TimelineDay[],
  weekStart: Date,
  peerRecords: AllocationRecord[]
): Array<{ dateKey: string; share: number }> {
  const style = barStyleForRange(
    parseDateOnlyInput(bar.startDate),
    parseDateOnlyInput(bar.endDate),
    weekStart,
    days.length
  );
  if (!style.visible) return [];

  const barStart = parseDateOnlyInput(bar.startDate).getTime();
  const barEnd = parseDateOnlyInput(bar.endDate).getTime();
  const records = normalizePeerRecords(
    peerRecords.length > 0
      ? peerRecords
      : [
          {
            id: bar.id,
            projectId: bar.projectId,
            userId: bar.userId,
            startDate: parseDateOnlyInput(bar.startDate),
            endDate: parseDateOnlyInput(bar.endDate),
            allocationMode: bar.allocationMode,
            plannedDays: bar.plannedDays,
            splitWeight: null,
            dailyRateSnapshot: bar.dailyRateSnapshot,
          },
        ]
  );

  return days
    .filter((day) => {
      const t = day.date.getTime();
      return t >= barStart && t <= barEnd;
    })
    .map((day) => {
      const shares = getDailyShares(bar.userId, day.date, records);
      return {
        dateKey: day.dateKey,
        share: clampShare(shares.get(bar.id) ?? 0),
      };
    });
}

function TimelineBar({
  bar,
  weekStart,
  days,
  dayWidth,
  showProject,
  peerRecords = [],
  onSelect,
}: {
  bar: ScheduleBar;
  weekStart: Date;
  days: TimelineDay[];
  dayWidth: number;
  showProject: boolean;
  peerRecords?: AllocationRecord[];
  onSelect: () => void;
}) {
  const style = barStyleForRange(
    parseDateOnlyInput(bar.startDate),
    parseDateOnlyInput(bar.endDate),
    weekStart,
    days.length,
    dayWidth
  );
  const fills = useMemo(
    () => dayFillsForBar(bar, days, weekStart, peerRecords),
    [bar, days, weekStart, peerRecords]
  );
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  if (!style.visible || fills.length === 0) return null;

  const colorClass = staffColorClass(bar.userId);
  const summary = `${bar.userName}${showProject ? ` · ${bar.projectName}` : ""} · 本周期 ${formatPersonDays(bar.effectiveDays)} 人天 · ${ALLOCATION_MODE_LABELS[bar.allocationMode]}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={summary}
      aria-label={summary}
      onMouseLeave={() => setHoveredDay(null)}
      className={cn(
        "absolute top-1 bottom-1 overflow-visible transition-shadow",
        "outline outline-1 outline-transparent",
        hoveredDay ? "z-20 outline-2 outline-foreground/70" : null
      )}
      style={{ left: style.left, width: style.width, minWidth: 0 }}
    >
      <div className="absolute inset-0 flex">
        {fills.map((fill, index) => {
          const heightPct = fillHeightPct(fill.share);
          const prevHeightPct =
            index > 0 ? fillHeightPct(fills[index - 1].share) : null;
          const nextHeightPct =
            index < fills.length - 1 ? fillHeightPct(fills[index + 1].share) : null;
          const active = hoveredDay === fill.dateKey;
          return (
            <div
              key={fill.dateKey}
              className="relative h-full min-w-0 flex-1"
              onMouseEnter={() => setHoveredDay(fill.dateKey)}
            >
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0",
                  colorClass,
                  active && "brightness-110",
                  dayFillCornerClass(heightPct, prevHeightPct, nextHeightPct)
                )}
                style={{ height: `${heightPct}%` }}
              />
              {fill.share > 0 && active ? (
                <span
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-0.5 z-30 -translate-x-1/2 whitespace-nowrap",
                    "rounded bg-foreground/90 px-1 py-0.5 text-[10px] font-medium leading-none text-background shadow"
                  )}
                >
                  {formatPersonDays(fill.share)}人日
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
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
  peerRecordsByUser = {},
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
  peerRecordsByUser?: Record<string, AllocationRecord[]>;
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
          "relative shrink-0 min-h-[52px]",
          isOver && canDrop && "bg-primary/5 ring-1 ring-inset ring-primary/30"
        )}
        style={{ width: days.length * DAY_COLUMN_WIDTH }}
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
              dayWidth={DAY_COLUMN_WIDTH}
              days={days}
              showProject={showProject}
              peerRecords={peerRecordsByUser[bar.userId] ?? []}
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
  const [error, setError] = useState<string | null>(null);
  const [activeStaffId, setActiveStaffId] = useState<string | null>(null);
  const [selectedBar, setSelectedBar] = useState<ScheduleBar | null>(null);
  const [draftSegment, setDraftSegment] = useState<{ startDate: string; endDate: string } | null>(
    null
  );

  const weekStart = useMemo(() => new Date(weekStartIso), [weekStartIso]);
  const days = useMemo(() => buildTimelineDays(getWeekPeriod(weekStart)), [weekStart]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const dndContextId = useId();

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
    const projectBars = (bars ?? []).filter((bar) => bar.userId === userId);
    setError(null);

    const overlapping = findOverlappingSegment(startDate, endDate, projectBars);
    setDraftSegment({ startDate, endDate });

    if (overlapping) {
      setSelectedBar(overlapping);
      return;
    }

    if (projectBars.length > 0) {
      setSelectedBar(projectBars[0]);
      return;
    }

    const staffMember = staff.find((member) => member.id === userId);
    if (!staffMember || !projectId || !projectName) {
      setError("无法打开排班编辑器");
      return;
    }

    setSelectedBar(
      buildDraftScheduleBar({
        userId,
        userName: staffMember.name,
        projectId,
        projectName,
        startDate,
        endDate,
        dailyRate: staffMember.dailyRate,
      })
    );
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

      <DndContext
        id={dndContextId}
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
                peerRecordsByUser={peerRecordsByUser}
                canDrop={canEdit && Boolean(projectId)}
                onSelectBar={(bar) => {
                  setDraftSegment(null);
                  setSelectedBar(bar);
                }}
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
                  peerRecordsByUser={peerRecordsByUser}
                  canDrop={false}
                  onSelectBar={(bar) => {
                  setDraftSegment(null);
                  setSelectedBar(bar);
                }}
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
          key={`${selectedBar.id}-${draftSegment?.startDate ?? "view"}`}
          bar={selectedBar}
          projectSegments={(bars ?? []).filter((b) => b.userId === selectedBar.userId)}
          canEdit={canEdit}
          peerRecords={peerRecordsForSelected}
          draftSegment={draftSegment}
          onClose={() => {
            setDraftSegment(null);
            setSelectedBar(null);
          }}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
