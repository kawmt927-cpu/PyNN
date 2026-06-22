"use client";

import { useCallback } from "react";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/opportunities/status";
import {
  EntitySearchSelect,
  type SearchSelectOption,
} from "@/components/ui/entity-search-select";
import type { OpportunityStatus } from "@prisma/client";

type Props = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  selectedLabel: string;
  onValueChange: (value: string, option?: SearchSelectOption) => void;
  status?: OpportunityStatus | "ALL";
  customerId?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
};

async function fetchOpportunities(
  q: string,
  status?: OpportunityStatus | "ALL",
  customerId?: string
): Promise<SearchSelectOption[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (customerId) params.set("customerId", customerId);
  if (status && status !== "ALL") params.set("status", status);

  const res = await fetch(`/api/opportunities/suggest?${params.toString()}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items: Array<{
      id: string;
      title: string;
      status: OpportunityStatus;
      customerName?: string;
    }>;
  };

  return (data.items ?? []).map((item) => ({
    id: item.id,
    label: item.title,
    description: [
      OPPORTUNITY_STATUS_LABELS[item.status],
      item.customerName ? `客户：${item.customerName}` : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

export function OpportunitySearchSelect({
  status,
  customerId,
  className,
  labelClassName,
  ...props
}: Props) {
  const onSearch = useCallback(
    (q: string) => fetchOpportunities(q, status, customerId),
    [status, customerId]
  );

  return (
    <EntitySearchSelect
      {...props}
      className={className}
      labelClassName={labelClassName}
      placeholder={props.placeholder ?? "输入商机名称搜索…"}
      onSearch={onSearch}
    />
  );
}
