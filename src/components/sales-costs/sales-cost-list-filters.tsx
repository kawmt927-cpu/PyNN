"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SALES_COST_TYPE_OPTIONS } from "@/lib/sales-costs/labels";

type UserOption = { id: string; name: string };

type Props = {
  salesUsers: UserOption[];
};

const currentYear = new Date().getFullYear();

export function SalesCostListFilters({ salesUsers }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/sales-costs?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="filter-sales">销售</Label>
        <select
          id="filter-sales"
          className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("salesUserId") ?? ""}
          onChange={(e) => updateParam("salesUserId", e.target.value)}
        >
          <option value="">全部</option>
          {salesUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-type">类型</Label>
        <select
          id="filter-type"
          className="flex h-10 min-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("costType") ?? ""}
          onChange={(e) => updateParam("costType", e.target.value)}
        >
          <option value="">全部</option>
          {SALES_COST_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-year">年份</Label>
        <select
          id="filter-year"
          className="flex h-10 min-w-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("year") ?? String(currentYear)}
          onChange={(e) => updateParam("year", e.target.value)}
        >
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-month">月份</Label>
        <select
          id="filter-month"
          className="flex h-10 min-w-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("month") ?? ""}
          onChange={(e) => updateParam("month", e.target.value)}
        >
          <option value="">全年</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m} 月
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => router.push("/sales-costs")}
      >
        清除筛选
      </Button>
    </div>
  );
}
