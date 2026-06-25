import Link from "next/link";
import { format } from "date-fns";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { ChangeSummaryList } from "@/components/opportunities/change-summary-list";
import type { UnifiedFollowUpHistoryItem } from "@/lib/follow-ups/unified";
import { withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  followUps: UnifiedFollowUpHistoryItem[];
  linkReturnTo?: string;
};

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
      {followUps.map((f) => (
        <li key={`${f.source}-${f.id}`} className="rounded-md border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {f.contacts.length > 0 ? `${f.contacts.map((c) => c.name).join("、")} · ` : ""}
              {FOLLOW_UP_METHOD_LABELS[f.method]} · {f.user.name}
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
          {f.nextFollowUpAt && (
            <p className="mt-1 text-orange-600">
              下次跟进：
              {f.nextFollowUpMethod
                ? `${FOLLOW_UP_METHOD_LABELS[f.nextFollowUpMethod as keyof typeof FOLLOW_UP_METHOD_LABELS]} · `
                : ""}
              {format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm")}
            </p>
          )}
          {f.faceVisit && (
            <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
              <p>地点：{f.faceVisit.location}</p>
              {f.faceVisit.department && <p>科室：{f.faceVisit.department}</p>}
              <p className="mt-1">{f.faceVisit.detailedNotes}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
