"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type {
  OpportunityListSort,
  OpportunityListSortColumn,
} from "@/lib/opportunities/list-filters";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  column: OpportunityListSortColumn;
  sort: OpportunityListSort;
  onSort: (column: OpportunityListSortColumn) => void;
  className?: string;
};

/** 纯前端排序表头：不触发 router，避免 iframe 内连点卡死 */
export function OpportunitySortableTh({
  label,
  column,
  sort,
  onSort,
  className,
}: Props) {
  const active = sort.column === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={cn("pb-2 pr-4", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "font-medium text-foreground" : "text-muted-foreground"
        )}
        title={
          active
            ? `当前${sort.dir === "asc" ? "升序" : "降序"}，点击切换`
            : `按${label}排序`
        }
      >
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">
          {active ? (sort.dir === "asc" ? "升序" : "降序") : "可排序"}
        </span>
      </button>
    </th>
  );
}
