"use client";

import { useCallback } from "react";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import type { CustomerCategory } from "@prisma/client";
import {
  EntitySearchSelect,
  type SearchSelectOption,
} from "@/components/ui/entity-search-select";

type Props = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  selectedLabel: string;
  onValueChange: (value: string, option?: SearchSelectOption) => void;
  excludeId?: string;
  excludeIds?: string[];
  disabled?: boolean;
  onCreateNew?: (query: string) => void;
};

async function fetchCustomers(
  q: string,
  excludeId?: string,
  excludeIds?: string[]
): Promise<SearchSelectOption[]> {
  const params = new URLSearchParams({ q, mode: "form" });
  if (excludeId) params.set("excludeId", excludeId);
  if (excludeIds?.length) params.set("excludeIds", excludeIds.join(","));

  const res = await fetch(`/api/customers/suggest?${params.toString()}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items: Array<{ id: string; name: string; category?: string }>;
  };

  return (data.items ?? []).map((item) => ({
    id: item.id,
    label: item.name,
    description: item.category
      ? CUSTOMER_CATEGORY_LABELS[item.category as CustomerCategory]
      : undefined,
  }));
}

export function CustomerSearchSelect({
  excludeId,
  excludeIds,
  onCreateNew,
  ...props
}: Props) {
  const onSearch = useCallback(
    (q: string) => fetchCustomers(q, excludeId, excludeIds),
    [excludeId, excludeIds]
  );

  return (
    <EntitySearchSelect
      {...props}
      placeholder={props.placeholder ?? "输入客户名称搜索…"}
      onSearch={onSearch}
      onCreateNew={onCreateNew}
      createNewLabel="新增客户"
    />
  );
}
