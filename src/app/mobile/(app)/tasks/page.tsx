import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { getCustomerGradeLabelMap } from "@/lib/config-options";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { cn } from "@/lib/utils";

function mobileHrefForUpcoming(item: {
  kind: string;
  customerId?: string | null;
  opportunityId?: string | null;
  contractId?: string;
}) {
  if (item.kind === "payment_collection" && item.contractId) {
    return `/mobile/contracts/${item.contractId}`;
  }
  if (item.opportunityId) return `/mobile/opportunities/${item.opportunityId}`;
  if (item.customerId) return `/mobile/customers/${item.customerId}`;
  return null;
}

export default async function MobileTasksPage() {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const now = new Date();
  const [{ items, week }, dueFollowUps, gradeLabels] = await Promise.all([
    listUpcomingActionsThisWeek(session.user.role, session.user.id, 50),
    getPendingFollowUps(session.user.role, session.user.id, "due", now, 100),
    getCustomerGradeLabelMap(),
  ]);

  const weekLabel = `${format(week.weekStart, "M/d")} – ${format(week.weekEnd, "M/d")}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">待办</h1>
        <p className="text-xs text-muted-foreground">本周 {weekLabel} · 含到期跟进</p>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 pb-8">
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-orange-600">
            已到期（{dueFollowUps.length}）
          </h2>
          {dueFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无到期跟进</p>
          ) : (
            <ul className="space-y-2">
              {dueFollowUps.map((item) => {
                const href = item.opportunity
                  ? `/mobile/opportunities/${item.opportunity.id}`
                  : `/mobile/customers/${item.customer.id}`;
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.customer.name}</span>
                        <CustomerGradeIcon
                          grade={item.customer.customerGrade}
                          size="sm"
                          labelMap={gradeLabels}
                        />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.opportunity?.title ? `${item.opportunity.title} · ` : ""}
                        {item.content}
                      </p>
                      <p className="mt-1 text-xs text-orange-600">
                        计划 {format(item.nextFollowUpAt, "MM-dd HH:mm")}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">本周待办（{items.length}）</h2>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">本周暂无待办</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const remaining = getRemainingTimeInfo(item.dueAt, now);
                const href = mobileHrefForUpcoming(item);
                const kindLabel =
                  item.kind === "payment_collection"
                    ? "回款"
                    : item.kind === "assignment"
                      ? "指派"
                      : "跟进";
                const body = (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          item.kind === "payment_collection"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.kind === "assignment"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-orange-100 text-orange-800"
                        )}
                      >
                        {kindLabel}
                      </span>
                      <span className="font-medium">{item.title}</span>
                      {item.kind === "follow_up" ? (
                        <CustomerGradeIcon
                          grade={item.customerGrade}
                          size="sm"
                          labelMap={gradeLabels}
                        />
                      ) : null}
                    </div>
                    {item.subtitle ? (
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    ) : null}
                    <div className="mt-1 flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {format(
                          item.dueAt,
                          item.kind === "payment_collection" ? "MM-dd" : "MM-dd HH:mm"
                        )}
                        {item.overdue ? " · 已到期" : ""}
                      </span>
                      <span className={remainingTimeClassName(remaining.tone)}>
                        {remaining.label}
                      </span>
                    </div>
                  </>
                );

                return (
                  <li key={`${item.kind}-${item.id}`}>
                    {href ? (
                      <Link
                        href={href}
                        className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/50"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="rounded-xl border bg-card p-3 shadow-sm">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
