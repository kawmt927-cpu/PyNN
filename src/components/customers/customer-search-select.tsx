"use client";

import { forwardRef, useCallback } from "react";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import type { CustomerCategory } from "@prisma/client";
import {
  EntitySearchSelect,
  type EntitySearchSelectHandle,
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
  /** 仅搜索可录入往来/联系人的客户（打卡、手工往来） */
  writableOnly?: boolean;
  onCreateNew?: (query: string) => void;
  className?: string;
  labelClassName?: string;
};

async function fetchCustomers(
  q: string,
  excludeId?: string,
  excludeIds?: string[],
  writableOnly?: boolean
): Promise<SearchSelectOption[]> {
  const params = new URLSearchParams({ q, mode: "form" });
  if (excludeId) params.set("excludeId", excludeId);
  if (excludeIds?.length) params.set("excludeIds", excludeIds.join(","));
  if (writableOnly) params.set("scope", "writable");

  const res = await fetch(`/api/customers/suggest?${params.toString()}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items: Array<{
      id: string;
      name: string;
      category?: string;
      customerGrade?: string | null;
      writable?: boolean;
      ownerName?: string | null;
    }>;
  };

  return (data.items ?? []).map((item) => {
    const categoryLabel = item.category
      ? CUSTOMER_CATEGORY_LABELS[item.category as CustomerCategory]
      : undefined;
    const disabled = item.writable === false;

    return {
      id: item.id,
      label: item.name,
      description: disabled
        ? item.ownerName
          ? `负责人：${item.ownerName} · 不可选`
          : "公海客户 · 不可选"
        : categoryLabel,
      customerGrade: item.customerGrade ?? null,
      disabled,
    };
  });
}

export const CustomerSearchSelect = forwardRef<EntitySearchSelectHandle, Props>(
  function CustomerSearchSelect({ excludeId, excludeIds, writableOnly, onCreateNew, ...props }, ref) {
    const onSearch = useCallback(
      (q: string) => fetchCustomers(q, excludeId, excludeIds, writableOnly),
      [excludeId, excludeIds, writableOnly]
    );

    return (
      <EntitySearchSelect
        ref={ref}
        {...props}
        placeholder={
          props.placeholder ??
          (writableOnly ? "搜索客户，灰色项不可选…" : "输入客户名称搜索…")
        }
        onSearch={onSearch}
        onCreateNew={onCreateNew}
        createNewLabel="新增客户"
      />
    );
  }
);
