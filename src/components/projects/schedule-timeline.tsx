"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { projectColorClass } from "@/lib/projects/timeline-colors";
import {
  barStyleForRange,
  type TimelineDay,
} from "@/lib/projects/timeline";
import type { ScheduleBar } from "@/lib/projects/schedule-serialize";

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
            style={{ width: dayWidth, minHeight: 40 }}
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
  dimmed,
  highlighted,
  onSelect,
}: {
  bar: ScheduleBar;
  periodStart: Date;
  days: TimelineDay[];
  showProject: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  onSelect: () => void;
}) {
  const style = barStyleForRange(
    new Date(bar.startDate),
    new Date(bar.endDate),
    periodStart,
    days.length
  );
  if (!style.visible) return null;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${bar.userName}${showProject ? ` · ${bar.projectName}` : ""} · ${bar.effectiveDays} 人天`}
      className={cn(
        "absolute top-1 bottom-1 min-w-[28px] rounded px-1.5 text-left text-[11px] leading-tight text-white shadow transition-opacity",
        projectColorClass(bar.projectId),
        "hover:brightness-110",
        dimmed && "opacity-30",
        highlighted && "ring-2 ring-offset-1 ring-primary z-10"
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
