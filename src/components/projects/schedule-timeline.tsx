"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import {
  scheduleYearBandClass,
  scheduleYearBandMutedClass,
  useStaffColor,
} from "@/lib/projects/timeline-colors";
import {
  barStyleForRange,
  formatPersonDays,
  type TimelineDay,
} from "@/lib/projects/timeline";
import type { ScheduleBar } from "@/lib/projects/schedule-serialize";
import { getDailyShares, type AllocationRecord } from "@/lib/projects/allocation-split";
import { parseDateOnlyInput } from "@/lib/validations/project";
import { toDateOnly } from "@/lib/projects/workdays";
import {
  coalesceFillRuns,
  dayFillCornerClass,
  fillHeightPct,
} from "@/lib/projects/schedule-bar-fills";

type TimelineBand = {
  key: string;
  label: string;
  startIndex: number;
  dayCount: number;
  year: number;
  month?: number;
};

function buildYearBands(days: TimelineDay[]): TimelineBand[] {
  const bands: TimelineBand[] = [];
  for (let i = 0; i < days.length; i++) {
    const year = days[i].date.getFullYear();
    const last = bands[bands.length - 1];
    if (last && last.year === year) {
      last.dayCount += 1;
    } else {
      bands.push({
        key: `y-${year}-${i}`,
        label: String(year),
        startIndex: i,
        dayCount: 1,
        year,
      });
    }
  }
  return bands;
}

function buildMonthBands(days: TimelineDay[]): TimelineBand[] {
  const bands: TimelineBand[] = [];
  for (let i = 0; i < days.length; i++) {
    const date = days[i].date;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const last = bands[bands.length - 1];
    if (last && last.year === year && last.month === month) {
      last.dayCount += 1;
    } else {
      bands.push({
        key: `y${year}-m${month}`,
        label: `${month}月`,
        startIndex: i,
        dayCount: 1,
        year,
        month,
      });
    }
  }
  return bands;
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
  secondaryLabel,
  secondaryLabelWidth = 0,
}: {
  days: TimelineDay[];
  rowLabel: string;
  dayWidth: number;
  rowLabelWidth?: number;
  secondaryLabel?: string;
  secondaryLabelWidth?: number;
}) {
  // 窄列不能用 p-1：padding 会把列撑宽，表头与投入条像素轴错位
  const narrow = dayWidth < 16;
  // 「1月」等文字放不下时，改为年份色带 + 上方月份行
  const useBandHeader = dayWidth < 22;
  const trackWidth = days.length * dayWidth;
  const sideWidth = rowLabelWidth + (secondaryLabel ? secondaryLabelWidth : 0);
  const yearBands = useMemo(() => buildYearBands(days), [days]);
  const monthBands = useMemo(() => buildMonthBands(days), [days]);

  return (
    <div
      className="sticky top-0 z-20 flex border-b bg-muted text-xs text-muted-foreground"
      style={{ width: trackWidth + sideWidth, minWidth: trackWidth + sideWidth }}
    >
      <div
        className="sticky left-0 z-30 shrink-0 border-r bg-muted p-2 font-medium flex items-center shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]"
        style={{ width: rowLabelWidth, minWidth: rowLabelWidth, maxWidth: rowLabelWidth }}
      >
        {rowLabel}
      </div>
      {secondaryLabel ? (
        <div
          className="sticky z-30 shrink-0 border-r bg-muted p-2 font-medium flex items-center shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]"
          style={{
            width: secondaryLabelWidth,
            minWidth: secondaryLabelWidth,
            maxWidth: secondaryLabelWidth,
            left: rowLabelWidth,
          }}
        >
          {secondaryLabel}
        </div>
      ) : null}

      {useBandHeader ? (
        <div className="flex shrink-0 flex-col" style={{ width: trackWidth }}>
          <div className="relative flex h-5 border-b border-border/60 text-[10px] font-semibold leading-none">
            {yearBands.map((band) => (
              <div
                key={band.key}
                className={cn(
                  "box-border flex shrink-0 items-center overflow-hidden border-r border-border/50 px-1",
                  scheduleYearBandClass(band.year)
                )}
                style={{
                  width: band.dayCount * dayWidth,
                  minWidth: band.dayCount * dayWidth,
                  maxWidth: band.dayCount * dayWidth,
                }}
                title={`${band.year}年`}
              >
                <span className="whitespace-nowrap">{band.label}</span>
              </div>
            ))}
          </div>
          <div className="relative h-5 border-b border-border/40">
            {monthBands.map((band) => (
              <div
                key={band.key}
                className={cn(
                  "absolute top-0 bottom-0 box-border border-r border-border/30",
                  scheduleYearBandMutedClass(band.year)
                )}
                style={{
                  left: band.startIndex * dayWidth,
                  width: band.dayCount * dayWidth,
                }}
                title={`${band.year}年${band.label}`}
              >
                <span className="absolute left-0.5 top-1/2 z-[1] -translate-y-1/2 whitespace-nowrap text-[10px] font-medium leading-none text-foreground/80">
                  {band.label}
                </span>
              </div>
            ))}
          </div>
          <div className="flex h-2">
            {days.map((day) => (
              <div
                key={day.dateKey}
                className={cn(
                  "box-border shrink-0 border-r border-border/20",
                  scheduleYearBandMutedClass(day.date.getFullYear()),
                  day.isWeekend && "opacity-70"
                )}
                style={{
                  width: dayWidth,
                  minWidth: dayWidth,
                  maxWidth: dayWidth,
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex shrink-0" style={{ width: trackWidth }}>
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "box-border shrink-0 border-r text-center flex items-center justify-center overflow-hidden",
                !narrow && "p-1",
                day.isWeekend && "bg-muted/60"
              )}
              style={{
                width: dayWidth,
                minWidth: dayWidth,
                maxWidth: dayWidth,
                minHeight: 40,
                fontSize: narrow ? 9 : undefined,
              }}
            >
              {day.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleTimelineBar({
  bar,
  periodStart,
  days,
  dayWidth,
  showProject,
  peerRecords = [],
  dimmed,
  highlighted,
  onSelect,
}: {
  bar: ScheduleBar;
  periodStart: Date;
  days: TimelineDay[];
  dayWidth: number;
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
    days.length,
    dayWidth
  );
  const fills = useMemo(
    () => dayFillsForBar(bar, days, periodStart, peerRecords),
    [bar, days, periodStart, peerRecords]
  );
  const runs = useMemo(() => coalesceFillRuns(fills), [fills]);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const color = useStaffColor(bar.userId);

  if (!style.visible || runs.length === 0) return null;

  const summary = `${bar.userName}${showProject ? ` · ${bar.projectName}` : ""} · 本周期 ${formatPersonDays(bar.effectiveDays)} 人天 · ${ALLOCATION_MODE_LABELS[bar.allocationMode]} · ${bar.startDate}~${bar.endDate}`;

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
        hoveredDay ? "z-[2] outline-2 outline-foreground/70" : null,
        dimmed && "opacity-30",
        highlighted && "z-[1] outline-2 outline-primary"
      )}
      style={{ left: style.left, width: style.width, minWidth: 0 }}
    >
      <div className="absolute inset-0 flex">
        {runs.map((run, index) => {
          const heightPct = fillHeightPct(run.share);
          const prevHeightPct =
            index > 0 ? fillHeightPct(runs[index - 1].share) : null;
          const nextHeightPct =
            index < runs.length - 1 ? fillHeightPct(runs[index + 1].share) : null;
          const active = hoveredDay === run.dateKey;
          return (
            <div
              key={`${run.dateKey}-${run.dayCount}`}
              className="relative h-full min-w-0"
              style={{ flex: run.dayCount }}
              onMouseEnter={() => setHoveredDay(run.dateKey)}
            >
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0",
                  active && "brightness-110",
                  dayFillCornerClass(heightPct, prevHeightPct, nextHeightPct)
                )}
                style={{ height: `${heightPct}%`, backgroundColor: color }}
              />
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
  labelContent,
  secondaryLabel,
  secondaryLabelWidth,
  bars,
  showProject,
  peerRecords = [],
  canDrop,
  highlighted,
  dimmed,
  highlightUserIds,
  onSelectBar,
  dropTarget,
  rowMinHeight = 56,
}: {
  rowId: string;
  periodStart: Date;
  days: TimelineDay[];
  dayWidth: number;
  rowLabelWidth: number;
  label: string;
  sublabel?: string;
  /** 自定义左侧 sticky 内容（如富信息人员卡）；传入时覆盖 label/sublabel 文本 */
  labelContent?: ReactNode;
  secondaryLabel?: string;
  secondaryLabelWidth?: number;
  bars: ScheduleBar[];
  showProject: boolean;
  peerRecords?: AllocationRecord[];
  canDrop: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  highlightUserIds?: string[];
  onSelectBar: (bar: ScheduleBar) => void;
  dropTarget?: { projectId: string; userId: string };
  rowMinHeight?: number;
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
      style={{
        minWidth:
          rowLabelWidth +
          (secondaryLabelWidth ?? 0) +
          days.length * dayWidth,
        minHeight: rowMinHeight,
      }}
    >
      <div
        className={cn(
          "sticky left-0 z-20 shrink-0 border-r shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]",
          labelContent ? "p-0" : "p-2 text-xs",
          highlighted ? "bg-primary/10" : "bg-card"
        )}
        style={{ width: rowLabelWidth, minWidth: rowLabelWidth, maxWidth: rowLabelWidth }}
      >
        {labelContent ?? (
          <>
            <p className="truncate font-medium">{label}</p>
            {sublabel ? (
              <p className="truncate text-muted-foreground">{sublabel}</p>
            ) : null}
          </>
        )}
      </div>
      {secondaryLabel != null && secondaryLabelWidth != null ? (
        <div
          className={cn(
            "sticky z-20 shrink-0 border-r p-2 text-xs shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]",
            highlighted ? "bg-primary/10" : "bg-card"
          )}
          style={{
            width: secondaryLabelWidth,
            minWidth: secondaryLabelWidth,
            maxWidth: secondaryLabelWidth,
            left: rowLabelWidth,
          }}
          title={secondaryLabel}
        >
          <p className="font-medium truncate">{secondaryLabel}</p>
        </div>
      ) : null}
      <div
        ref={setNodeRef}
        className={cn(
          "relative z-0 shrink-0",
          isOver && canDrop && "bg-primary/10 ring-1 ring-inset ring-primary/40"
        )}
        style={{ width: days.length * dayWidth, minHeight: rowMinHeight }}
      >
        <div className="absolute inset-0 flex pointer-events-none">
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={cn(
                "box-border shrink-0 border-r border-dashed border-border/50 h-full",
                dayWidth < 22 && scheduleYearBandMutedClass(day.date.getFullYear()),
                day.isWeekend && "bg-muted/30"
              )}
              style={{ width: dayWidth, minWidth: dayWidth, maxWidth: dayWidth }}
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
              dayWidth={dayWidth}
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
  secondaryLabelWidth,
  label = "添加投入",
  hint = "",
  onAddClick,
}: {
  rowId: string;
  projectId: string;
  days: TimelineDay[];
  dayWidth: number;
  rowLabelWidth: number;
  canDrop: boolean;
  secondaryLabelWidth?: number;
  label?: string;
  hint?: string;
  /** 有点击回调时改为按钮，不再作为拖放目标 */
  onAddClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: rowId,
    data: { type: "project-add", projectId },
    disabled: !canDrop || Boolean(onAddClick),
  });

  return (
    <div
      className="flex border-b border-dashed"
      style={{
        minWidth: rowLabelWidth + (secondaryLabelWidth ?? 0) + days.length * dayWidth,
      }}
    >
      <div
        className="sticky left-0 z-20 shrink-0 border-r bg-card p-2 text-xs shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]"
        style={{ width: rowLabelWidth, minWidth: rowLabelWidth, maxWidth: rowLabelWidth }}
      >
        {onAddClick && canDrop ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={onAddClick}
          >
            {label}
          </Button>
        ) : (
          <p className="truncate text-muted-foreground" title={label}>
            {label}
          </p>
        )}
      </div>
      {secondaryLabelWidth != null && secondaryLabelWidth > 0 ? (
        <div
          className="sticky z-20 shrink-0 border-r bg-card p-2 text-xs text-muted-foreground shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]"
          style={{
            width: secondaryLabelWidth,
            minWidth: secondaryLabelWidth,
            maxWidth: secondaryLabelWidth,
            left: rowLabelWidth,
          }}
        />
      ) : null}
      <div
        ref={onAddClick ? undefined : setNodeRef}
        className={cn(
          "relative flex min-h-[40px] shrink-0 items-center justify-center text-xs text-muted-foreground",
          !onAddClick && isOver && canDrop && "bg-primary/10 text-primary ring-1 ring-inset ring-primary/40"
        )}
        style={{ width: days.length * dayWidth }}
      >
        {onAddClick && canDrop ? (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={onAddClick}
          >
            从资源池选择人员并设置时段
          </button>
        ) : (
          hint
        )}
      </div>
    </div>
  );
}

/** 全局排班：整块项目作为投放区，悬停时高亮整个项目 */
export function ScheduleProjectDropZone({
  projectId,
  canDrop,
  className,
  children,
}: {
  projectId: string;
  canDrop: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `project-drop-${projectId}`,
    data: { type: "project-drop", projectId },
    disabled: !canDrop,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver &&
          canDrop &&
          "bg-primary/5 ring-2 ring-inset ring-primary/35 transition-colors"
      )}
    >
      {children}
    </div>
  );
}
