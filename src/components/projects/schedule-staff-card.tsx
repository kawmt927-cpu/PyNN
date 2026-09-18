"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Lock, LockOpen } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/opportunities/funnel";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import { personnelTypeBadgeClass, useStaffColor } from "@/lib/projects/timeline-colors";
import type { ScheduleStaff } from "@/lib/projects/schedule-serialize";
import type { PersonnelType } from "@prisma/client";

/** 甘特左侧合并列宽度（富信息人员卡） */
export const STAFF_GANTT_LABEL_WIDTH = 248;

type Props = {
  member: ScheduleStaff;
  /** 周期副文案：优先用排班行摘要，否则用人员周期统计 */
  summary?: string;
  periodLabel?: string;
  canDrag?: boolean;
  compact?: boolean;
  className?: string;
  /** 全局排班侧栏：人员锁定（项目内嵌排班不传） */
  locked?: boolean;
  onToggleLock?: () => void;
  /** 点击标签（非拖拽）时回调，如跳转到排班起点 */
  onActivate?: () => void;
};

/** 人员富信息卡：用于侧栏或甘特 sticky 左侧列 */
export function ScheduleStaffCard({
  member,
  summary,
  periodLabel = "本周期",
  canDrag = false,
  compact = false,
  className,
  locked = false,
  onToggleLock,
  onActivate,
}: Props) {
  const color = useStaffColor(member.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${member.id}`,
    data: { type: "staff", userId: member.id },
    disabled: !canDrag,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const typeLabel = member.personnelType
    ? PERSONNEL_TYPE_LABELS[member.personnelType as PersonnelType] ?? member.personnelType
    : null;
  const statsText =
    summary ??
    `${periodLabel} ${member.weekEffectiveDays} 人天 · ${member.parallelProjects} 项目`;

  const dragProps = canDrag
    ? { ...listeners, ...attributes }
    : onActivate
      ? {
          role: "button" as const,
          tabIndex: 0,
          title: "点击跳转到排班起点",
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            onActivate();
          },
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onActivate();
            }
          },
        }
      : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "text-sm transition-colors",
        compact ? "h-full px-2 py-1.5" : "rounded-lg border p-3",
        !compact &&
          (locked
            ? "border-primary bg-primary/5"
            : "bg-card hover:bg-muted/50"),
        member.resigned && "bg-muted/40 text-muted-foreground opacity-90",
        !compact &&
          member.resigned &&
          !locked &&
          "border-muted hover:bg-muted/50",
        isDragging && "opacity-50",
        canDrag && "cursor-grab active:cursor-grabbing",
        onActivate && !canDrag && "cursor-pointer hover:bg-muted/40",
        className
      )}
      {...dragProps}
    >
      <div className="flex h-full gap-2">
        <span
          className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
              <p
                className={cn(
                  "truncate font-medium leading-tight",
                  member.resigned && "text-muted-foreground"
                )}
              >
                {member.name}
              </p>
              {typeLabel ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    personnelTypeBadgeClass(member.personnelType as PersonnelType)
                  )}
                >
                  {typeLabel}
                </span>
              ) : null}
              {member.resigned ? (
                <span className="inline-flex shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                  离职
                </span>
              ) : null}
              {member.weekLoadPercent > 100 && !member.hidePeriodMetrics ? (
                <span className="text-[10px] font-medium text-destructive">
                  {member.weekLoadPercent}%
                </span>
              ) : null}
            </div>
            {onToggleLock ? (
              <button
                type="button"
                title={locked ? "解除锁定" : "锁定此人"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "shrink-0 rounded p-1 transition-colors hover:bg-muted",
                  locked ? "text-primary" : "text-muted-foreground"
                )}
              >
                {locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {member.hidePeriodMetrics
              ? "已离职，本周期无排期"
              : member.resigned
                ? "已离职，仅保留历史排班记录"
                : member.dailyRate != null
                  ? `${formatAmount(member.dailyRate)}/天`
                  : "未设月成本"}
          </p>
          {!member.hidePeriodMetrics && (!member.resigned || summary) ? (
            <p className="truncate text-xs text-muted-foreground">{statsText}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
