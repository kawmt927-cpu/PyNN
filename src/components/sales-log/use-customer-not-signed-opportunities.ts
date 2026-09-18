"use client";

import { useCallback, useEffect, useState } from "react";

export type CustomerOpportunityOption = {
  id: string;
  title: string;
  confirmStatus?: "CONFIRMED" | "PENDING_MANAGER" | "REJECTED";
};

export function useCustomerNotSignedOpportunities(customerId: string | undefined) {
  const [options, setOptions] = useState<CustomerOpportunityOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setOptions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({ customerId, status: "NOT_SIGNED" });
    void fetch(`/api/opportunities/suggest?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then(
        (data: {
          items?: Array<{
            id: string;
            title: string;
            confirmStatus?: "CONFIRMED" | "PENDING_MANAGER" | "REJECTED";
          }>;
        }) => {
          if (cancelled) return;
          setOptions(
            (data.items ?? []).map((item) => ({
              id: item.id,
              title: item.title,
              confirmStatus: item.confirmStatus,
            }))
          );
        }
      )
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const upsertOption = useCallback((option: CustomerOpportunityOption) => {
    setOptions((prev) => {
      if (prev.some((item) => item.id === option.id)) {
        return prev.map((item) => (item.id === option.id ? { ...item, ...option } : item));
      }
      return [option, ...prev];
    });
  }, []);

  return { options, loading, upsertOption };
}

/** 加载完成后：仅 1 条商机时默认选中 */
export function defaultOpportunitySelection(
  options: CustomerOpportunityOption[]
): string[] {
  return options.length === 1 ? [options[0].id] : [];
}
