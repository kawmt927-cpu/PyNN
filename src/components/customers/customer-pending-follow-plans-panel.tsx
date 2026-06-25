"use client";

import type { SerializedCustomerPendingFollowPlan } from "@/lib/follow-ups/unified";
import { PendingFollowPlanItem } from "@/components/customers/pending-follow-plan-item";

type Props = {
  items: SerializedCustomerPendingFollowPlan[];
};

export function CustomerPendingFollowPlansPanel({ items }: Props) {
  if (items.length === 0) return null;

  const overdueCount = items.filter((item) => item.isOverdue).length;

  return (
    <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50/40 p-4 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          待跟进计划
          <span className="ml-2 font-normal text-muted-foreground">（{items.length} 条）</span>
        </p>
        {overdueCount > 0 ? (
          <span className="text-xs text-orange-700">{overdueCount} 条已到期</span>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <PendingFollowPlanItem key={`${item.source}-${item.id}`} item={item} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        保存本次跟进时，请选择一条或多条待跟进计划并完成。
      </p>
    </div>
  );
}
