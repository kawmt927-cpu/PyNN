"use client";

import { useEffect, useState } from "react";

export type CustomerOpportunityOption = {
  id: string;
  title: string;
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
      .then((data: { items?: Array<{ id: string; title: string }> }) => {
        if (cancelled) return;
        setOptions(
          (data.items ?? []).map((item) => ({
            id: item.id,
            title: item.title,
          }))
        );
      })
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

  return { options, loading };
}

/** 加载完成后：仅 1 条商机时默认选中 */
export function defaultOpportunitySelection(
  options: CustomerOpportunityOption[]
): string[] {
  return options.length === 1 ? [options[0].id] : [];
}
