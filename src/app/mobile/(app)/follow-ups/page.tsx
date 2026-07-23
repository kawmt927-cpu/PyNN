import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ scope?: string }>;
};

export default async function MobileFollowUpsPage({ searchParams }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const { scope: raw } = await searchParams;
  const scope = raw === "upcoming" ? "upcoming" : "due";
  const now = new Date();
  const items = await getPendingFollowUps(session.user.role, session.user.id, scope, now, 80);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/mobile/more" className="text-xs text-primary">
          ← 更多
        </Link>
        <h1 className="mt-1 text-lg font-bold">待跟进</h1>
        <p className="text-xs text-muted-foreground">点击可写跟进（本人负责客户）</p>
      </header>

      <div className="flex shrink-0 gap-2 border-b px-4 py-2">
        <Link
          href="/mobile/follow-ups?scope=due"
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            scope === "due" ? "bg-primary text-primary-foreground" : "border"
          )}
        >
          已到期
        </Link>
        <Link
          href="/mobile/follow-ups?scope=upcoming"
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            scope === "upcoming" ? "bg-primary text-primary-foreground" : "border"
          )}
        >
          即将到期
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无记录</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={`${item.source}-${item.id}`}>
                <Link
                  href={`/mobile/customers/${item.customer.id}/follow-ups`}
                  className="block rounded-xl border bg-card p-3 active:bg-muted/50"
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-medium">{item.customer.name}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {format(item.nextFollowUpAt, "M/d")}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
