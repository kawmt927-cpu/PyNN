"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  buildOpportunityListHref,
  EMPTY_OPPORTUNITY_LIST_FILTERS,
  type OpportunityListFilters,
  type OpportunityListSort,
} from "@/lib/opportunities/list-filters";
import type { ConfigOptionItem } from "@/lib/config-options";
import { OpportunityMultiFilterSelect } from "@/components/opportunities/opportunity-multi-filter-select";
import { OpportunityGradeDisplay } from "@/components/opportunities/opportunity-grade-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withPreservedMainScroll } from "@/lib/ui/preserve-main-scroll";

type SalesOption = { id: string; name: string };

type Props = {
  filters: OpportunityListFilters;
  sort: OpportunityListSort;
  stageOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  showOwnerFilter?: boolean;
  salesUsers?: SalesOption[];
};

export function OpportunityListFilters({
  filters,
  sort,
  stageOptions,
  gradeOptions,
  showOwnerFilter = false,
  salesUsers = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function applyFilters(next: OpportunityListFilters) {
    withPreservedMainScroll(() => {
      startTransition(() => {
        router.replace(buildOpportunityListHref(next, sort), { scroll: false });
      });
    });
  }

  return (
    <div className="space-y-3 border-b pb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="opportunity-q">搜索</Label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              applyFilters({
                ...filters,
                q: String(form.get("q") ?? "").trim(),
              });
            }}
          >
            <Input
              id="opportunity-q"
              name="q"
              defaultValue={filters.q}
              key={filters.q}
              placeholder="商机名称 / 客户"
              className="h-10"
              disabled={pending}
            />
            <Button type="submit" variant="secondary" size="sm" className="h-10 shrink-0" disabled={pending}>
              搜索
            </Button>
          </form>
        </div>
        <OpportunityMultiFilterSelect
          id="opportunity-stage"
          label="阶段"
          emptyLabel="全部阶段"
          options={stageOptions}
          value={filters.stages}
          onChange={(stages) => applyFilters({ ...filters, stages })}
        />
        <OpportunityMultiFilterSelect
          id="opportunity-grade"
          label="等级"
          emptyLabel="全部等级"
          options={gradeOptions}
          value={filters.grades}
          onChange={(grades) => applyFilters({ ...filters, grades })}
          renderOptionLabel={(option) => (
            <OpportunityGradeDisplay
              grade={option.value}
              description={option.label}
              size="sm"
              className="min-w-0"
            />
          )}
        />
        {showOwnerFilter ? (
          <OpportunityMultiFilterSelect
            id="opportunity-owner"
            label="负责销售"
            emptyLabel="全部负责销售"
            options={salesUsers.map((user) => ({ value: user.id, label: user.name }))}
            value={filters.ownerIds}
            onChange={(ownerIds) => applyFilters({ ...filters, ownerIds })}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => applyFilters(EMPTY_OPPORTUNITY_LIST_FILTERS)}
        >
          重置
        </Button>
        <Button asChild size="sm">
          <Link href="/opportunities/new">新建商机</Link>
        </Button>
      </div>
    </div>
  );
}
