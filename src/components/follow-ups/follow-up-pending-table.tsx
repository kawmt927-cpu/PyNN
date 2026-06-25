import Link from "next/link";
import { format } from "date-fns";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { formatPendingFollowUpRemainingDays } from "@/lib/follow-ups/remaining-days";
import type { UnifiedPendingFollowUp } from "@/lib/follow-ups/unified";
import { withReturnTo } from "@/lib/navigation/return-to";
import { cn } from "@/lib/utils";

type Props = {
  items: UnifiedPendingFollowUp[];
  listPath: string;
  gradeLabels: Record<string, string>;
  now?: Date;
};

export function FollowUpPendingTable({ items, listPath, gradeLabels, now = new Date() }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">客户</th>
            <th className="pb-2 pr-4">关联商机</th>
            <th className="pb-2 pr-4">等级</th>
            <th className="pb-2 pr-4">方式</th>
            <th className="pb-2 pr-4">跟进摘要</th>
            <th className="pb-2 pr-4">负责人</th>
            <th className="pb-2 pr-4">剩余天数</th>
            <th className="pb-2 pr-4">计划时间</th>
            <th className="pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => {
            const remaining = formatPendingFollowUpRemainingDays(f.nextFollowUpAt, now);
            return (
              <tr key={`${f.source}-${f.id}`} className="border-b">
                <td className="py-3 pr-4 font-medium">{f.customer.name}</td>
                <td className="py-3 pr-4">
                  {f.opportunity ? (
                    <Link
                      href={withReturnTo(`/opportunities/${f.opportunity.id}`, listPath)}
                      className="text-primary hover:underline"
                    >
                      {f.opportunity.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-3 pr-4">
                  <CustomerGradeIcon grade={f.customer.customerGrade} labelMap={gradeLabels} />
                </td>
                <td className="py-3 pr-4">
                  {f.method ? FOLLOW_UP_METHOD_LABELS[f.method] : "—"}
                  {f.source === "opportunity" && (
                    <span className="ml-1 text-xs text-muted-foreground">(商机)</span>
                  )}
                  {f.source === "grade_expiry" && (
                    <span className="ml-1 text-xs text-orange-600">(等级到期)</span>
                  )}
                </td>
                <td className="max-w-xs truncate py-3 pr-4">{f.content}</td>
                <td className="py-3 pr-4">{f.user?.name ?? f.owner.name ?? "—"}</td>
                <td
                  className={cn(
                    "py-3 pr-4 font-medium",
                    remaining.overdue ? "text-destructive" : "text-foreground"
                  )}
                >
                  {remaining.label}
                </td>
                <td className="py-3 pr-4">{format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm")}</td>
                <td className="py-3">
                  <Link
                    href={
                      f.opportunity
                        ? withReturnTo(`/opportunities/${f.opportunity.id}/follow-ups`, listPath)
                        : withReturnTo(`/customers/${f.customer.id}/follow-ups`, listPath)
                    }
                    className="text-primary hover:underline"
                  >
                    去跟进
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
