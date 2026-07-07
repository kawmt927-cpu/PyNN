"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import {
  buildCustomerListHref,
  hasActiveCustomerListFilters,
  type CustomerListFilters,
} from "@/lib/customers/list-filters";
import type { CustomerListView } from "@/lib/customers/access";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import { withReturnTo } from "@/lib/navigation/return-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCustomerGradeOptions } from "@/lib/customers/grade";
import { CustomerTagFilterSelect } from "@/components/customers/customer-tag-filter-select";
import { CustomerRegionFilter } from "@/components/customers/customer-region-filter";

type SalesOption = { id: string; name: string };

type SuggestItem = { id: string; name: string };

type Props = {
  view: CustomerListView;
  filters: CustomerListFilters;
  typeOptions: ConfigOptionItem[];
  tagOptions?: CustomerTagDefinition[];
  showOwnerFilter?: boolean;
  salesUsers?: SalesOption[];
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const EMPTY_FILTERS: CustomerListFilters = {
  q: "",
  category: "",
  customerType: "",
  customerGrade: "",
  ownerId: "",
  tags: [],
  province: "",
  city: "",
  district: "",
};

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}
      >
        {options.map((opt) => (
          <option key={opt.value || "__all__"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function buildSuggestQuery(view: CustomerListView, filters: CustomerListFilters) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.customerType) params.set("type", filters.customerType);
  if (filters.customerGrade) params.set("grade", filters.customerGrade);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  return params.toString();
}

export function CustomerListFilters({
  view,
  filters,
  typeOptions,
  tagOptions = [],
  showOwnerFilter = false,
  salesUsers = [],
}: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef(filters);
  const [q, setQ] = useState(filters.q);
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [listPending, setListPending] = useState(false);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    setQ(filters.q);
  }, [filters.q]);

  const listPath = buildCustomerListHref(view, { ...filters, q });

  const applyFilters = useCallback(
    (next: CustomerListFilters) => {
      router.replace(buildCustomerListHref(view, next));
    },
    [router, view]
  );

  const withLocalQ = useCallback(
    (patch: Partial<CustomerListFilters> = {}): CustomerListFilters => ({
      ...filtersRef.current,
      q,
      ...patch,
    }),
    [q]
  );

  useEffect(() => {
    if (q === filters.q) {
      setListPending(false);
      return;
    }

    setListPending(true);
    const timer = window.setTimeout(() => {
      applyFilters(withLocalQ());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [q, filters.q, applyFilters, withLocalQ]);

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed || !suggestOpen) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const current = withLocalQ({ q: trimmed });
        const query = buildSuggestQuery(view, current);
        const res = await fetch(`/api/customers/suggest?${query}`);
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { items: SuggestItem[] };
        setSuggestions(data.items ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [q, suggestOpen, view, withLocalQ]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setSuggestOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const categoryOptions = [
    { value: "", label: "全部类别" },
    ...Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];
  const typeFilterOptions = [{ value: "", label: "全部关系类型" }, ...typeOptions];
  const gradeFilterOptions = [{ value: "", label: "全部等级" }, ...getCustomerGradeOptions()];
  const ownerOptions = [
    { value: "", label: "全部负责人" },
    { value: "pool", label: "公海池" },
    ...salesUsers.map((user) => ({ value: user.id, label: user.name })),
  ];

  const showDropdown = suggestOpen && q.trim().length > 0;

  return (
    <div ref={rootRef} className="space-y-3 border-b pb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="relative space-y-1.5 sm:col-span-2 lg:col-span-3 xl:col-span-2">
          <Label htmlFor="customer-q" className="text-xs text-muted-foreground">
            客户名称
          </Label>
          <Input
            id="customer-q"
            value={q}
            placeholder="输入名称即时搜索…"
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
          />
          {showDropdown && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md">
              {suggestLoading ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">匹配中…</p>
              ) : suggestions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">暂无匹配客户</p>
              ) : (
                <ul className="max-h-60 overflow-y-auto py-1">
                  {suggestions.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={withReturnTo(`/customers/${item.id}`, listPath)}
                        className="block px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => setSuggestOpen(false)}
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <FilterSelect
          id="customer-category"
          label="类别"
          value={filters.category}
          onChange={(category) => applyFilters(withLocalQ({ category }))}
          options={categoryOptions}
        />
        <FilterSelect
          id="customer-type"
          label="关系类型"
          value={filters.customerType}
          onChange={(customerType) => applyFilters(withLocalQ({ customerType }))}
          options={typeFilterOptions}
        />
        <FilterSelect
          id="customer-grade"
          label="等级"
          value={filters.customerGrade}
          onChange={(customerGrade) => applyFilters(withLocalQ({ customerGrade }))}
          options={gradeFilterOptions}
        />
        <CustomerTagFilterSelect
          id="customer-tags"
          options={tagOptions}
          value={filters.tags}
          onChange={(tags) => applyFilters(withLocalQ({ tags }))}
        />
        {showOwnerFilter && (
          <FilterSelect
            id="customer-owner"
            label="负责人"
            value={filters.ownerId}
            onChange={(ownerId) => applyFilters(withLocalQ({ ownerId }))}
            options={ownerOptions}
          />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <CustomerRegionFilter
          view={view}
          province={filters.province}
          city={filters.city}
          district={filters.district}
          onChange={(patch) => applyFilters(withLocalQ(patch))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(listPending || suggestLoading) && (
          <span className="text-xs text-muted-foreground">正在更新结果…</span>
        )}
        {hasActiveCustomerListFilters({ ...filters, q }) && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildCustomerListHref(view, EMPTY_FILTERS)}>重置</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
