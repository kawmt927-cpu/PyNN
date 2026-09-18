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
  // true：全库搜索且仅可选可写客户；false：全库搜索且非负责人也可选（往来录入）
  if (writableOnly === true || writableOnly === false) {
    params.set("scope", "writable");
  }

  const res = await fetch(`/api/customers/suggest?${params.toString()}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items: Array<{
      id: string;
      name: string;
      category?: string;
      customerType?: string | null;
      customerGrade?: string | null;
      writable?: boolean;
      ownerName?: string | null;
      matchedContactName?: string | null;
      matchedContactTitle?: string | null;
    }>;
  };

  return (data.items ?? []).map((item) => {
    const categoryLabel = item.category
      ? CUSTOMER_CATEGORY_LABELS[item.category as CustomerCategory]
      : undefined;
    const writable = item.writable !== false;
    const disabled = writableOnly === true && !writable;
    const contactHint = item.matchedContactName
      ? item.matchedContactTitle
        ? `联系人：${item.matchedContactName}（${item.matchedContactTitle}）`
        : `联系人：${item.matchedContactName}`
      : null;

    let description: string | undefined;
    if (!writable) {
      description = item.ownerName
        ? disabled
          ? `负责人：${item.ownerName} · 不可选`
          : `负责人：${item.ownerName} · 提交后需确认`
        : disabled
          ? "公海客户 · 不可选"
          : "公海客户 · 提交后需确认";
      if (contactHint) description = `${contactHint} · ${description}`;
    } else if (contactHint) {
      description = categoryLabel ? `${contactHint} · ${categoryLabel}` : contactHint;
    } else {
      description = categoryLabel;
    }

    return {
      id: item.id,
      label: item.name,
      description,
      customerType: item.customerType ?? null,
      customerGrade: item.customerGrade ?? null,
      writable,
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
          (writableOnly === true
            ? "搜客户名或联系人，灰色项不可选…"
            : writableOnly === false
              ? "搜客户名或联系人（非负责客户提交后需确认）…"
              : "输入客户名称或联系人搜索…")
        }
        onSearch={onSearch}
        onCreateNew={onCreateNew}
        createNewLabel="新增客户"
      />
    );
  }
);
