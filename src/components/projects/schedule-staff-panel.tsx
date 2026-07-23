"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { formatAmount } from "@/lib/opportunities/funnel";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import { personnelTypeBadgeClass, staffColorClass } from "@/lib/projects/timeline-colors";
import type { ScheduleStaff } from "@/lib/projects/schedule-serialize";
import type { PersonnelType } from "@prisma/client";

type StaffFilter = "all" | "has_rate" | "overloaded" | "idle";

type Props = {
  staff: ScheduleStaff[];
  lockedPersonIds?: string[];
  onToggleLock: (id: string) => void;
  onClearLocks: () => void;
  canDrag: boolean;
  periodLabel?: string;
};

function DraggableStaffItem({
  member,
  locked,
  disabled,
  onToggleLock,
  periodLabel,
}: {
  member: ScheduleStaff;
  locked: boolean;
  disabled: boolean;
  onToggleLock: () => void;
  periodLabel: string;
}) {
  // 有人锁定时：仅已锁定人员可拖；锁定本身不禁止拖入项目
  const canDrag = !disabled;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${member.id}`,
    data: { type: "staff", userId: member.id },
    disabled: !canDrag,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const typeLabel = member.personnelType
    ? PERSONNEL_TYPE_LABELS[member.personnelType as PersonnelType] ?? member.personnelType
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border p-3 text-sm transition-colors",
        locked ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50",
        isDragging && "opacity-50",
        canDrag && "cursor-grab active:cursor-grabbing",
        !canDrag && "opacity-60"
      )}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
    >
      <div className="flex gap-2">
        <span
          className={cn("mt-0.5 w-1 shrink-0 rounded-full self-stretch", staffColorClass(member.id))}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
              <p className="font-medium leading-tight">{member.name}</p>
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
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {member.weekLoadPercent > 100 ? (
                <span className="text-[10px] text-destructive font-medium">
                  {member.weekLoadPercent}%
                </span>
              ) : null}
              <button
                type="button"
                title={locked ? "解除锁定" : "锁定此人"}
                onClick={onToggleLock}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "rounded p-1 transition-colors hover:bg-muted",
                  locked ? "text-primary" : "text-muted-foreground"
                )}
              >
                {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {member.dailyRate != null ? `${formatAmount(member.dailyRate)}/天` : "未设月成本"}
          </p>
          <p className="text-xs text-muted-foreground">
            {periodLabel} {member.weekEffectiveDays} 人天 · {member.parallelProjects} 项目
          </p>
        </div>
      </div>
    </div>
  );
}

export function ScheduleStaffPanel({
  staff,
  lockedPersonIds = [],
  onToggleLock,
  onClearLocks,
  canDrag,
  periodLabel = "本周",
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StaffFilter>("all");
  const [showMore, setShowMore] = useState(false);
  const hasLocks = lockedPersonIds.length > 0;
  const lockedSet = useMemo(() => new Set(lockedPersonIds), [lockedPersonIds]);

  const filtered = useMemo(() => {
    return staff.filter((member) => {
      if (search.trim() && !member.name.toLowerCase().includes(search.trim().toLowerCase())) {
        return false;
      }
      if (typeFilter !== "all" && member.personnelType !== typeFilter) return false;
      if (statusFilter === "has_rate" && member.dailyRate == null) return false;
      if (statusFilter === "overloaded" && member.weekLoadPercent <= 100) return false;
      if (statusFilter === "idle" && member.parallelProjects > 0) return false;
      return true;
    });
  }, [staff, search, typeFilter, statusFilter]);

  const typeOptions = useMemo(() => {
    const types = new Set(staff.map((s) => s.personnelType).filter(Boolean));
    return [
      { value: "all", label: "全部类型" },
      ...[...types].map((t) => ({
        value: t!,
        label: PERSONNEL_TYPE_LABELS[t as PersonnelType] ?? t!,
      })),
    ];
  }, [staff]);

  const hasMoreFiltersActive =
    search.trim().length > 0 || statusFilter !== "all" || hasLocks;

  return (
    <div className="flex h-full flex-col border-r bg-muted/10">
      <div className="shrink-0 bg-card px-3 py-2">
        <div className="flex h-8 items-center gap-2">
          <p className="shrink-0 text-sm font-medium">人员</p>
          <span className="inline-block w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
            {filtered.length} 人
          </span>
          <select
            id="staff-type-filter"
            name="typeFilter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              typeFilter === "all"
                ? "border-input bg-background"
                : cn("border-transparent", personnelTypeBadgeClass(typeFilter))
            )}
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowMore((open) => !open)}
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 text-xs font-medium transition-colors",
              showMore || hasMoreFiltersActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            更多
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")}
            />
          </button>
        </div>
        {hasLocks ? (
          <button
            type="button"
            className="mt-1 text-xs leading-4 text-primary hover:underline"
            onClick={onClearLocks}
          >
            解除全部锁定（{lockedPersonIds.length} 人）
          </button>
        ) : null}

        {showMore ? (
          <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
            <Input
              placeholder="搜索姓名…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <SelectField
              id="staff-status-filter"
              name="statusFilter"
              label="状态筛选"
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StaffFilter)}
              labelClassName="text-xs"
              className="gap-1.5"
              options={[
                { value: "all", label: "全部" },
                { value: "has_rate", label: "已设月成本" },
                { value: "overloaded", label: "超载 (>100%)" },
                { value: "idle", label: `${periodLabel}无项目` },
              ]}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map((member) => {
          const isLocked = lockedSet.has(member.id);
          // 有人锁定时，未锁定人员不可拖；已锁定人员仍可拖入项目
          const dragDisabled = !canDrag || (hasLocks && !isLocked);
          return (
            <DraggableStaffItem
              key={member.id}
              member={member}
              locked={isLocked}
              disabled={dragDisabled}
              onToggleLock={() => onToggleLock(member.id)}
              periodLabel={periodLabel}
            />
          );
        })}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">无匹配人员</p>
        ) : null}
      </div>
    </div>
  );
}
