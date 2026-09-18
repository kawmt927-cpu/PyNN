import { requireSession } from "@/lib/session";
import {
  canAccessSalesMobile,
  isMobileManagerRole,
} from "@/lib/mobile/sales-roles";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { countUnreadNotifications } from "@/lib/notifications/app-notifications";

/**
 * 报销挂在 (app) 外以便项目/人事也可进；销售侧角色仍包一层底栏壳。
 */
export default async function MobileExpensesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const salesMobile = canAccessSalesMobile(session.user.role);

  if (!salesMobile) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-lg flex-col overflow-hidden bg-background">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    );
  }

  const manager = isMobileManagerRole(session.user.role);
  const [pendingApprovals, unread] = await Promise.all([
    countPendingApprovals({
      id: session.user.id,
      role: session.user.role,
    }),
    countUnreadNotifications(session.user.id),
  ]);

  return (
    <MobileShell
      navVariant={manager ? "manager" : "sales"}
      moreBadge={pendingApprovals > 0 || unread > 0}
    >
      {children}
    </MobileShell>
  );
}
