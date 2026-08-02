"use client";

import { useRouter } from "next/navigation";
import type { OpportunityStatus } from "@prisma/client";
import {
  buildOpportunityListHref,
  OPPORTUNITY_STATUS_FILTER_OPTIONS,
  type OpportunityListFilters,
  type OpportunityListSort,
} from "@/lib/opportunities/list-filters";
import { withPreservedMainScroll } from "@/lib/ui/preserve-main-scroll";
import { cn } from "@/lib/utils";

type Props = {
  filters: OpportunityListFilters;
  sort: OpportunityListSort;
  className?: string;
};

export function OpportunityStatusCheckboxes({ filters, sort, className }: Props) {
  const router = useRouter();
  const selected = new Set(filters.statuses);

  function toggle(status: OpportunityStatus) {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);

    withPreservedMainScroll(() => {
      router.replace(
        buildOpportunityListHref(
          { ...filters, statuses: [...next] as OpportunityStatus[] },
          sort
        ),
        { scroll: false }
      );
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-x-4 gap-y-1",
        className
      )}
      role="group"
      aria-label="商机状态筛选"
    >
      {OPPORTUNITY_STATUS_FILTER_OPTIONS.map((option) => {
        const checked = selected.has(option.value);
        const id = `opportunity-status-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <input
              id={id}
              type="checkbox"
              checked={checked}
              onChange={() => toggle(option.value)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
