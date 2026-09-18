"use client";

import Link from "next/link";
import { format } from "date-fns";
import type { FollowUpMethod } from "@prisma/client";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import { followUpConfirmStatusLabel } from "@/lib/follow-ups/confirm-status";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { ChangeSummaryList } from "@/components/opportunities/change-summary-list";
import type { UnifiedFollowUpHistoryItem } from "@/lib/follow-ups/unified";
import { withReturnTo } from "@/lib/navigation/return-to";
import { EntityDeleteButton } from "@/components/navigation/entity-delete-button";
import { deleteUnifiedFollowUp } from "@/app/(dashboard)/customers/actions";
import { cn } from "@/lib/utils";

type Props = {
  followUps: UnifiedFollowUpHistoryItem[];
  linkReturnTo?: string;
  /** 管理员 / 销管可删 */
  canDelete?: boolean;
  customerId?: string;
};

function followUpMethodLabel(method: FollowUpMethod) {
  const salesLabel = salesLogMethodLabel(method);
  if (salesLabel !== method) return salesLabel;
  return FOLLOW_UP_METHOD_LABELS[method];
}

export function FollowUpHistoryList({
  followUps,
  linkReturnTo,
  canDelete = false,
  customerId,
}: Props) {
  const opportunityHref = (opportunityId: string) =>
    linkReturnTo
      ? withReturnTo(`/opportunities/${opportunityId}`, linkReturnTo)
      : `/opportunities/${opportunityId}`;
  if (followUps.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无跟进记录</p>;
  }

  return (
    <ul className="space-y-4">
      {followUps.map((f) => {
        const nextRelative = f.nextFollowUpAt
          ? formatPendingFollowUpRelativeLabel(f.nextFollowUpAt)
          : null;

        return (
          <li key={`${f.source}-${f.id}`} className="rounded-md border p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {f.contacts.length > 0
                      ? `${f.contacts.map((c) => c.name).join("、")} · `
                      : ""}
                    {followUpMethodLabel(f.method)} · {f.user.name}
                    {f.confirmStatus && f.confirmStatus !== "CONFIRMED" ? (
                      <span
                        className={cn(
                          "ml-2 rounded px-1.5 py-0.5 text-xs font-normal",
                          f.confirmStatus === "PENDING_MANAGER"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {followUpConfirmStatusLabel(f.confirmStatus)}
                      </span>
                    ) : null}
                    {(f.opportunities?.length
                      ? f.opportunities
                      : f.opportunity
                        ? [f.opportunity]
                        : []
                    ).map((opp, index, list) => (
                      <span key={opp.id}>
                        {index === 0 ? " · " : ""}
                        {list.length > 1 ? "商机" : "商机："}
                        <Link
                          href={opportunityHref(opp.id)}
                          className="text-primary hover:underline"
                        >
                          {opp.title}
                        </Link>
                        {index < list.length - 1 ? "、" : ""}
                      </span>
                    ))}
                  </span>
                  <span className="text-muted-foreground">
                    {format(f.followUpAt, "yyyy-MM-dd HH:mm")}
                  </span>
                </div>
                {f.source === "opportunity" && (
                  <p className="mt-1 text-xs text-muted-foreground">来源：商机跟进</p>
                )}
                <p className="mt-2 whitespace-pre-wrap">{f.content}</p>
                {f.changeSummary && <ChangeSummaryList summary={f.changeSummary} />}
                {f.result && (
                  <p className="mt-1 text-muted-foreground">结果：{f.result}</p>
                )}
                {f.nextFollowUpAt && nextRelative ? (
                  <div className="mt-1 text-orange-600">
                    <p>
                      {[
                        "下次跟进",
                        nextRelative.label,
                        ...(f.nextFollowUpMethod
                          ? [followUpMethodLabel(f.nextFollowUpMethod)]
                          : []),
                        format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm"),
                      ].join(" · ")}
                    </p>
                    {f.nextFollowUpContent ? (
                      <p className="mt-0.5 text-sm text-orange-600/90">
                        {f.nextFollowUpContent}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {canDelete ? (
                <EntityDeleteButton
                  size="sm"
                  variant="ghost"
                  label="删除"
                  confirmTitle="删除往来"
                  confirmMessage="确定删除这条往来记录？删除后不可恢复。"
                  confirmLabel="确认删除"
                  onDelete={async () => {
                    const fd = new FormData();
                    fd.set("source", f.source);
                    fd.set("id", f.id);
                    if (customerId) fd.set("customerId", customerId);
                    return deleteUnifiedFollowUp(fd);
                  }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
