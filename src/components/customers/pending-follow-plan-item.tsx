"use client";

import { format } from "date-fns";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import { cn } from "@/lib/utils";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import type { FollowUpMethod } from "@prisma/client";
import type { SerializedCustomerPendingFollowPlan } from "@/lib/follow-ups/unified";

function methodLabel(method: FollowUpMethod | null) {
  if (!method) return "—";
  return FOLLOW_UP_METHOD_LABELS[method];
}

function sourceLabel(source: SerializedCustomerPendingFollowPlan["source"]) {
  if (source === "opportunity") return "商机跟进";
  if (source === "grade_expiry") return "等级到期";
  return "客户跟进";
}

type Props = {
  item: SerializedCustomerPendingFollowPlan;
  selected?: boolean;
  selectable?: boolean;
  multiple?: boolean;
  onSelect?: () => void;
};

export function PendingFollowPlanItem({ item, selected, selectable, multiple, onSelect }: Props) {
  const plannedMethod = item.nextFollowUpMethod ?? item.method;
  const dueAt = new Date(item.nextFollowUpAt);
  const relative = formatPendingFollowUpRelativeLabel(dueAt);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{format(dueAt, "yyyy-MM-dd HH:mm")}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs",
            relative.overdue
              ? "bg-orange-100 text-orange-700"
              : "bg-muted text-muted-foreground"
          )}
        >
          {relative.label}
        </span>
        <span className="text-xs text-muted-foreground">{sourceLabel(item.source)}</span>
        {plannedMethod ? (
          <span className="text-xs text-muted-foreground">· {methodLabel(plannedMethod)}</span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.content}</p>
      {item.opportunity ? (
        <p className="mt-1 text-xs text-muted-foreground">关联商机：{item.opportunity.title}</p>
      ) : null}
      {item.userName ? (
        <p className="mt-1 text-xs text-muted-foreground">上次跟进：{item.userName}</p>
      ) : null}
    </>
  );

  if (selectable) {
    return (
      <label
        className={cn(
          "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40",
          selected && "border-primary bg-primary/5"
        )}
      >
        <input
          type={multiple ? "checkbox" : "radio"}
          className="mt-1 h-4 w-4 shrink-0 rounded border-input"
          checked={selected}
          onChange={onSelect}
        />
        <div className="min-w-0 flex-1">{body}</div>
      </label>
    );
  }

  return <div className="rounded-md border bg-muted/20 p-3">{body}</div>;
}
