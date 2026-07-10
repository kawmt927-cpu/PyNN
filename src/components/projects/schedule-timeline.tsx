"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { staffColorClass } from "@/lib/projects/timeline-colors";
import {
  barStyleForRange,
  formatPersonDays,
  type TimelineDay,
} from "@/lib/projects/timeline";
import type { ScheduleBar } from "@/lib/projects/schedule-serialize";
import { getDailyShares, type AllocationRecord } from "@/lib/projects/allocation-split";
import { parseDateOnlyInput } from "@/lib/validations/project";
import { toDateOnly } from "@/lib/projects/workdays";

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

function clampShare(share: number): number {
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.min(share, 1);
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
  periodStart: Date,
  peerRecords: AllocationRecord[]
): Array<{ dateKey: string; share: number }> {
  const style = barStyleForRange(
    parseDateOnlyInput(bar.startDate),
    parseDateOnlyInput(bar.endDate),
    periodStart,
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

export function ScheduleTimelineHeader({
  days,
  rowLabel,
  dayWidth,
  rowLabelWidth = 160,
}: {
  days: TimelineDay[];
  rowLabel: string;
  dayWidth: number;
  rowLabelWidth?: number;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex border-b bg-muted/80 backdrop-blur text-xs text-muted-foreground"
      style={{ minWidth: days.length * dayWidth + rowLabelWidth }}
    >
      <div
        className="shrink-0 border-r p-2 font-medium flex items-center"
        style={{ width: rowLabelWidth }}
      >
        {rowLabel}
      </div>
      <div className="flex">
        {days.map((day) => (
          <div
            key={day.dateKey}
            className={cn(
              "border-r p-1 text-center flex items-center justify-center",
              day.isWeekend && "bg-muted/60"
            )}
            style={{ width: dayWidth, minHeight: 40, fontSize: dayWidth < 16 ? 9 : undefined }}
          >
            {day.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleTimelineBar({
  bar,
  periodStart,
  days,
  showProject,
  peerRecords = [],
  dimmed,
  highlighted,
  onSelect,
}: {
  bar: ScheduleBar;
  periodStart: Date;
  days: TimelineDay[];
  showProject: boolean;
  peerRecords?: AllocationRecord[];
  dimmed?: boolean;
  highlighted?: boolean;
  onSelect: () => void;
}) {
  const style = barStyleForRange(
    parseDateOnlyInput(bar.startDate),
    parseDateOnlyInput(bar.endDate),
    periodStart,
    days.length
  );
  const fills = useMemo(
    () => dayFillsForBar(bar, days, periodStart, peerRecords),
    [bar, days, periodStart, peerRecords]
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
        hoveredDay ? "z-20 outline-2 outline-foreground/70" : null,
        dimmed && "opacity-30",
        highlighted && "z-10 outline-2 outline-primary"
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

export function ScheduleTimelineRow({
  rowId,
  periodStart,
  days,
  dayWidth,
  rowLabelWidth,
  label,
  sublabel,
  bars,
  showProject,
  peerRecords = [],
  canDrop,
  highlighted,
  dimmed,
  highlightUserIds,
  onSelectBar,
  dropTarget,
}: {
  rowId: string;
  periodStart: Date;
  days: TimelineDay[];
  dayWidth: number;
  rowLabelWidth: number;
  label: string;
  sublabel?: string;
  bars: ScheduleBar[];
  showProject: boolean;
  peerRecords?: AllocationRecord[];
  canDrop: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  highlightUserIds?: string[];
  onSelectBar: (bar: ScheduleBar) => void;
  dropTarget?: { projectId: string; userId: string };
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: rowId,
    data: dropTarget
      ? { type: "timeline-row", projectId: dropTarget.projectId, userId: dropTarget.userId }
      : { type: "timeline-row" },
    disabled: !canDrop,
  });

  return (
    <div
      className={cn(
        "flex border-b",
        highlighted && "bg-primary/5",
        dimmed && "opacity-40"
      )}
    >
      <div
        className="shrink-0 border-r p-2 text-xs"
        style={{ width: rowLabelWidth }}
      >
        <p className="font-medium truncate">{label}</p>
        {sublabel ? (
          <p className="text-muted-foreground truncate">{sublabel}</p>
        ) : null}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex-1 min-h-[56px]",
          isOver && canDrop && "bg-primary/10 ring-1 ring-inset ring-primary/40"
        )}
        style={{ minWidth: days.length * dayWidth }}
      >
        <div className="absolute inset-0 flex pointer-events-none">
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "border-r border-dashed border-border/50 h-full",
                day.isWeekend && "bg-muted/30"
              )}
              style={{ width: dayWidth }}
            />
          ))}
        </div>
        <div className="absolute inset-0">
          {bars.map((bar) => (
            <ScheduleTimelineBar
              key={bar.id}
              bar={bar}
              periodStart={periodStart}
              days={days}
              showProject={showProject}
              peerRecords={peerRecords}
              highlighted={highlightUserIds != null && highlightUserIds.includes(bar.userId)}
              onSelect={() => onSelectBar(bar)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScheduleTimelineAddRow({
  rowId,
  projectId,
  days,
  dayWidth,
  rowLabelWidth,
  canDrop,
}: {
  rowId: string;
  projectId: string;
  days: TimelineDay[];
  dayWidth: number;
  rowLabelWidth: number;
  canDrop: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: rowId,
    data: { type: "project-add", projectId },
    disabled: !canDrop,
  });

  return (
    <div className="flex border-b border-dashed">
      <div
        className="shrink-0 border-r p-2 text-xs text-muted-foreground"
        style={{ width: rowLabelWidth }}
      >
        添加投入
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex-1 min-h-[44px] flex items-center justify-center text-xs text-muted-foreground",
          isOver && canDrop && "bg-primary/10 text-primary ring-1 ring-inset ring-primary/40"
        )}
        style={{ minWidth: days.length * dayWidth }}
      >
        将左侧人员拖入此处
      </div>
    </div>
  );
}
