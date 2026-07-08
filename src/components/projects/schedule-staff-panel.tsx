"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Lock, LockOpen } from "lucide-react";
import { formatAmount } from "@/lib/opportunities/funnel";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
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
  const canDrag = !disabled && member.dailyRate != null;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${member.id}`,
    data: { type: "staff", userId: member.id },
    disabled: !canDrag,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border p-3 text-sm transition-colors",
        locked ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50",
        isDragging && "opacity-50",
        canDrag && "cursor-grab active:cursor-grabbing"
      )}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight">{member.name}</p>
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
        {member.dailyRate != null ? `${formatAmount(member.dailyRate)}/天` : "未设日单价"}
        {member.personnelType
          ? ` · ${PERSONNEL_TYPE_LABELS[member.personnelType as PersonnelType] ?? member.personnelType}`
          : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {periodLabel} {member.weekEffectiveDays} 人天 · {member.parallelProjects} 项目
      </p>
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

  return (
    <div className="flex h-full flex-col border-r bg-muted/10">
      <div className="shrink-0 space-y-3 border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">人员</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} 人</span>
        </div>
        <Input
          placeholder="搜索姓名…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SelectField
          id="staff-type-filter"
          name="typeFilter"
          label="人员类型"
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={typeOptions}
        />
        <SelectField
          id="staff-status-filter"
          name="statusFilter"
          label="状态筛选"
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StaffFilter)}
          options={[
            { value: "all", label: "全部" },
            { value: "has_rate", label: "已设日单价" },
            { value: "overloaded", label: "超载 (>100%)" },
            { value: "idle", label: `${periodLabel}无项目` },
          ]}
        />
        {hasLocks ? (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={onClearLocks}
          >
            解除全部锁定（{lockedPersonIds.length} 人）
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map((member) => (
          <DraggableStaffItem
            key={member.id}
            member={member}
            locked={lockedSet.has(member.id)}
            disabled={!canDrag}
            onToggleLock={() => onToggleLock(member.id)}
            periodLabel={periodLabel}
          />
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">无匹配人员</p>
        ) : null}
      </div>
    </div>
  );
}
