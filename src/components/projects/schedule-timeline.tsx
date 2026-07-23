"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import {
  scheduleYearBandClass,
  scheduleYearBandMutedClass,
  staffColorClass,
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
      className="sticky top-0 z-10 flex border-b bg-muted/80 backdrop-blur text-xs text-muted-foreground"
      style={{ width: trackWidth + sideWidth, minWidth: trackWidth + sideWidth }}
    >
      <div
        className="shrink-0 border-r p-2 font-medium flex items-center"
        style={{ width: rowLabelWidth }}
      >
        {rowLabel}
      </div>
      {secondaryLabel ? (
        <div
          className="shrink-0 border-r p-2 font-medium flex items-center"
          style={{ width: secondaryLabelWidth }}
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
}: {
  rowId: string;
  periodStart: Date;
  days: TimelineDay[];
  dayWidth: number;
  rowLabelWidth: number;
  label: string;
  sublabel?: string;
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
      {secondaryLabel != null && secondaryLabelWidth != null ? (
        <div
          className="shrink-0 border-r p-2 text-xs"
          style={{ width: secondaryLabelWidth }}
          title={secondaryLabel}
        >
          <p className="font-medium truncate">{secondaryLabel}</p>
        </div>
      ) : null}
      <div
        ref={setNodeRef}
        className={cn(
          "relative shrink-0 min-h-[56px]",
          isOver && canDrop && "bg-primary/10 ring-1 ring-inset ring-primary/40"
        )}
        style={{ width: days.length * dayWidth }}
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
        title={label}
      >
        <p className="truncate">{label}</p>
      </div>
      {secondaryLabelWidth != null && secondaryLabelWidth > 0 ? (
        <div
          className="shrink-0 border-r p-2 text-xs text-muted-foreground"
          style={{ width: secondaryLabelWidth }}
        />
      ) : null}
      <div
        ref={setNodeRef}
        className={cn(
          "relative shrink-0 min-h-[40px] flex items-center justify-center text-xs text-muted-foreground",
          isOver && canDrop && "bg-primary/10 text-primary ring-1 ring-inset ring-primary/40"
        )}
        style={{ width: days.length * dayWidth }}
      >
        {hint}
      </div>
    </div>
  );
}
