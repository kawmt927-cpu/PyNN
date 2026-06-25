import Link from "next/link";
import { format } from "date-fns";
import type { FollowUpMethod } from "@prisma/client";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { ChangeSummaryList } from "@/components/opportunities/change-summary-list";
import type { UnifiedFollowUpHistoryItem } from "@/lib/follow-ups/unified";
import { withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  followUps: UnifiedFollowUpHistoryItem[];
  linkReturnTo?: string;
};

function followUpMethodLabel(method: FollowUpMethod) {
  const salesLabel = salesLogMethodLabel(method);
  if (salesLabel !== method) return salesLabel;
  return FOLLOW_UP_METHOD_LABELS[method];
}

export function FollowUpHistoryList({ followUps, linkReturnTo }: Props) {
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {f.contacts.length > 0 ? `${f.contacts.map((c) => c.name).join("、")} · ` : ""}
              {followUpMethodLabel(f.method)} · {f.user.name}
              {f.opportunity && (
                <>
                  {" · "}
                  <Link
                    href={opportunityHref(f.opportunity.id)}
                    className="text-primary hover:underline"
                  >
                    商机：{f.opportunity.title}
                  </Link>
                </>
              )}
            </span>
            <span className="text-muted-foreground">
              {format(f.followUpAt, "yyyy-MM-dd HH:mm")}
            </span>
          </div>
          {f.source === "opportunity" && (
            <p className="mt-1 text-xs text-muted-foreground">来源：商机跟进</p>
          )}
          <p className="mt-2">{f.content}</p>
          {f.changeSummary && <ChangeSummaryList summary={f.changeSummary} />}
          {f.result && <p className="mt-1 text-muted-foreground">结果：{f.result}</p>}
          {f.nextFollowUpAt && nextRelative ? (
            <div className="mt-1 text-orange-600">
              <p>
                {[
                  "下次跟进",
                  nextRelative.label,
                  ...(f.nextFollowUpMethod ? [followUpMethodLabel(f.nextFollowUpMethod)] : []),
                  format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm"),
                ].join(" · ")}
              </p>
              {f.nextFollowUpContent ? (
                <p className="mt-0.5 text-sm text-orange-600/90">{f.nextFollowUpContent}</p>
              ) : null}
            </div>
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}
