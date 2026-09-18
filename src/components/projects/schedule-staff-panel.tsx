"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import { personnelTypeSwatchClass } from "@/lib/projects/timeline-colors";
import type { ScheduleStaff } from "@/lib/projects/schedule-serialize";
import type { PersonnelType } from "@prisma/client";
import { ScheduleStaffCard } from "@/components/projects/schedule-staff-card";
import { ScrollChain } from "@/components/ui/scroll-chain";

type StaffFilter = "all" | "has_rate" | "overloaded" | "idle";

type Props = {
  staff: ScheduleStaff[];
  canDrag: boolean;
  periodLabel?: string;
  /** 全局排班：支持锁定筛选；项目内嵌不传 */
  lockedPersonIds?: string[];
  onToggleLock?: (id: string) => void;
  onClearLocks?: () => void;
};

export function ScheduleStaffPanel({
  staff,
  canDrag,
  periodLabel = "本周",
  lockedPersonIds = [],
  onToggleLock,
  onClearLocks,
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StaffFilter>("all");
  const [showMore, setShowMore] = useState(false);
  const [showResigned, setShowResigned] = useState(true);
  const lockEnabled = Boolean(onToggleLock);
  const hasLocks = lockedPersonIds.length > 0;
  const lockedSet = useMemo(() => new Set(lockedPersonIds), [lockedPersonIds]);

  const { activeStaff, resignedStaff } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (member: ScheduleStaff) => {
      if (q && !member.name.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && member.personnelType !== typeFilter) return false;
      if (statusFilter === "has_rate" && member.dailyRate == null) return false;
      if (statusFilter === "overloaded" && member.weekLoadPercent <= 100) return false;
      if (statusFilter === "idle" && member.parallelProjects > 0) return false;
      return true;
    };
    const byName = (a: ScheduleStaff, b: ScheduleStaff) =>
      a.name.localeCompare(b.name, "zh-CN");
    return {
      activeStaff: staff.filter((m) => !m.resigned && match(m)).sort(byName),
      resignedStaff: staff.filter((m) => m.resigned && match(m)).sort(byName),
    };
  }, [staff, search, typeFilter, statusFilter]);

  function renderCard(member: ScheduleStaff) {
    const isLocked = lockedSet.has(member.id);
    const dragDisabled = !canDrag || member.resigned || (hasLocks && !isLocked);
    return (
      <ScheduleStaffCard
        key={member.id}
        member={member}
        locked={isLocked}
        canDrag={!dragDisabled}
        periodLabel={periodLabel}
        onToggleLock={
          lockEnabled && onToggleLock ? () => onToggleLock(member.id) : undefined
        }
      />
    );
  }

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

  const selectedTypeLabel =
    typeOptions.find((opt) => opt.value === typeFilter)?.label ?? "全部类型";

  const hasMoreFiltersActive =
    search.trim().length > 0 || statusFilter !== "all" || hasLocks;

  return (
    <div className="flex h-full flex-col border-r bg-muted/10">
      <div className="shrink-0 bg-card px-3 py-2">
        <div className="flex h-8 items-center gap-2">
          <p className="shrink-0 text-sm font-medium">人员</p>
          <span className="inline-block w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
            {activeStaff.length} 人
          </span>
          <Popover open={typeMenuOpen} onOpenChange={setTypeMenuOpen}>
            <PopoverTrigger asChild>
              <button
                id="staff-type-filter"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={typeMenuOpen}
                className="flex h-8 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 truncate text-left">{selectedTypeLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[var(--radix-popover-trigger-width)] p-1"
            >
              <ul
                role="listbox"
                aria-labelledby="staff-type-filter"
                className="max-h-64 overflow-y-auto"
              >
                {typeOptions.map((opt) => {
                  const selected = opt.value === typeFilter;
                  return (
                    <li key={opt.value} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted",
                          selected && "bg-muted font-medium"
                        )}
                        onClick={() => {
                          setTypeFilter(opt.value);
                          setTypeMenuOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        {opt.value !== "all" ? (
                          <span
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-sm",
                              personnelTypeSwatchClass(opt.value)
                            )}
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
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
        {lockEnabled && hasLocks && onClearLocks ? (
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

      <ScrollChain className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {activeStaff.map(renderCard)}
        {showResigned && resignedStaff.length > 0 ? (
          <>
            <p className="pt-2 text-xs text-muted-foreground">离职实施</p>
            {resignedStaff.map(renderCard)}
          </>
        ) : null}
        {activeStaff.length === 0 && !showResigned ? (
          <p className="py-8 text-center text-sm text-muted-foreground">无匹配人员</p>
        ) : null}
      </ScrollChain>
      {resignedStaff.length > 0 ? (
        <div className="shrink-0 border-t bg-card px-3 py-2">
          <button
            type="button"
            onClick={() => setShowResigned((open) => !open)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showResigned
              ? `收起离职实施（${resignedStaff.length}）`
              : `显示离职实施（${resignedStaff.length}）`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
