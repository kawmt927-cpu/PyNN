"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  buildPortfolioHref,
  PORTFOLIO_ACTIVE_STATUSES,
  type PortfolioFilters,
  type PortfolioManagerOption,
} from "@/lib/projects/portfolio";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import { withPreservedMainScroll } from "@/lib/ui/preserve-main-scroll";

type Props = {
  filters: PortfolioFilters;
  managers: PortfolioManagerOption[];
};

export function PortfolioFiltersBar({ filters, managers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: PortfolioFilters) {
    withPreservedMainScroll(() => {
      startTransition(() => {
        router.replace(buildPortfolioHref(next), { scroll: false });
      });
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b pb-4">
      <div className="space-y-1">
        <Label htmlFor="portfolio-status">状态</Label>
        <select
          id="portfolio-status"
          className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={filters.status}
          disabled={pending}
          onChange={(e) =>
            apply({
              ...filters,
              status: e.target.value as PortfolioFilters["status"],
            })
          }
        >
          <option value="">全部在途</option>
          {PORTFOLIO_ACTIVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="portfolio-manager">项目经理</Label>
        <select
          id="portfolio-manager"
          className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={filters.managerId}
          disabled={pending}
          onChange={(e) => apply({ ...filters, managerId: e.target.value })}
        >
          <option value="">全部</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <label className="mb-1 inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={filters.overdueOnly}
          disabled={pending}
          onChange={(e) => apply({ ...filters, overdueOnly: e.target.checked })}
        />
        仅逾期
      </label>
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={pending}
        onClick={() => apply({ status: "", overdueOnly: false, managerId: "" })}
      >
        清除筛选
      </Button>
    </div>
  );
}
