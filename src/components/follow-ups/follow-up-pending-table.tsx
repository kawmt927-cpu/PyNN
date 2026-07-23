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

const thClass = "whitespace-nowrap pb-2 pr-4";
const tdClass = "whitespace-nowrap py-3 pr-4";

export function FollowUpPendingTable({ items, listPath, gradeLabels, now = new Date() }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className={thClass}>客户</th>
            <th className={thClass}>关联商机</th>
            <th className={thClass}>等级</th>
            <th className={thClass}>方式</th>
            <th className={thClass}>跟进摘要</th>
            <th className={thClass}>负责人</th>
            <th className={thClass}>剩余天数</th>
            <th className={thClass}>计划时间</th>
            <th className="whitespace-nowrap pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => {
            const remaining = formatPendingFollowUpRemainingDays(f.nextFollowUpAt, now);
            return (
              <tr key={`${f.source}-${f.id}`} className="border-b">
                <td className={cn(tdClass, "max-w-[14rem] truncate font-medium")} title={f.customer.name}>
                  <Link
                    href={withReturnTo(`/customers/${f.customer.id}`, listPath)}
                    className="text-primary hover:underline"
                  >
                    {f.customer.name}
                  </Link>
                </td>
                <td className={cn(tdClass, "max-w-[12rem] truncate")}>
                  {f.opportunity ? (
                    <Link
                      href={withReturnTo(`/opportunities/${f.opportunity.id}`, listPath)}
                      className="text-primary hover:underline"
                      title={f.opportunity.title}
                    >
                      {f.opportunity.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={tdClass}>
                  <CustomerGradeIcon grade={f.customer.customerGrade} labelMap={gradeLabels} />
                </td>
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-1">
                    <span>{f.method ? FOLLOW_UP_METHOD_LABELS[f.method] : "—"}</span>
                    {f.source === "opportunity" ? (
                      <span className="text-xs text-muted-foreground">(商机)</span>
                    ) : null}
                    {f.source === "grade_expiry" ? (
                      <span className="text-xs text-orange-600">(等级到期)</span>
                    ) : null}
                  </span>
                </td>
                <td className={cn(tdClass, "max-w-[18rem] truncate")} title={f.content}>
                  {f.content}
                </td>
                <td className={tdClass}>{f.user?.name ?? f.owner.name ?? "—"}</td>
                <td
                  className={cn(
                    tdClass,
                    "font-medium",
                    remaining.overdue ? "text-destructive" : "text-foreground"
                  )}
                >
                  {remaining.label}
                </td>
                <td className={tdClass}>{format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm")}</td>
                <td className="whitespace-nowrap py-3">
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
