import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { MOBILE_MANAGER_ROLES } from "@/lib/mobile/sales-roles";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { cn } from "@/lib/utils";

export default async function MobilePlansPage() {
  const session = await requireRole(MOBILE_MANAGER_ROLES);
  const upcoming = await listUpcomingActionsThisWeek(session.user.role, session.user.id, 50);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">计划与任务</h1>
        <p className="text-xs text-muted-foreground">本周团队待办；年度目标请在电脑端维护</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">
        {upcoming.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">本周暂无待办</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.items.map((item) => {
              const href =
                "customerId" in item && item.customerId
                  ? `/mobile/customers/${item.customerId}`
                  : item.kind === "payment_collection"
                    ? `/mobile/contracts/${item.contractId}`
                    : "/mobile/plans";
              const overdue = "overdue" in item ? Boolean(item.overdue) : false;
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={href}
                    className="block rounded-xl border bg-card p-3 active:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <span
                        className={cn(
                          "shrink-0 text-[11px]",
                          overdue ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {format(item.dueAt, "M/d")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.owner.name}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
