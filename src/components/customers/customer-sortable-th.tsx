"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  buildCustomerListHref,
  nextCustomerListSort,
  type CustomerListFilters,
  type CustomerListSort,
  type CustomerListSortColumn,
} from "@/lib/customers/list-filters";
import type { CustomerListView } from "@/lib/customers/access";
import { cn } from "@/lib/utils";
import { getDashboardMainEl } from "@/lib/ui/preserve-main-scroll";

type Props = {
  label: string;
  column: CustomerListSortColumn;
  view: CustomerListView;
  filters: CustomerListFilters;
  sort: CustomerListSort;
  className?: string;
};

export function CustomerSortableTh({
  label,
  column,
  view,
  filters,
  sort,
  className,
}: Props) {
  const active = sort.column === column;
  const next = nextCustomerListSort(sort, column);
  const href = buildCustomerListHref(view, filters, 1, next);
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={cn("whitespace-nowrap pb-2 pr-4", className)}>
      <Link
        href={href}
        scroll={false}
        onClick={() => {
          const main = getDashboardMainEl();
          if (!main) return;
          const top = main.scrollTop;
          const restore = () => {
            if (main.scrollTop !== top) main.scrollTop = top;
          };
          requestAnimationFrame(() => {
            restore();
            requestAnimationFrame(restore);
          });
          window.setTimeout(restore, 50);
          window.setTimeout(restore, 200);
        }}
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
      </Link>
    </th>
  );
}
