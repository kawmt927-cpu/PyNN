import { ROLE_LABELS } from "@/lib/permissions";
import { getNavForRoleAsync } from "@/lib/rbac/has-permission";
import { requireSession } from "@/lib/session";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { prisma } from "@/lib/prisma";
import {
  canStartImpersonation,
  getImpersonationTargetRoles,
  toImpersonationTargets,
} from "@/lib/auth/impersonation";
import { canAccessSalesMobile } from "@/lib/mobile/sales-roles";
import {
  canAccessNotifications,
  countUnreadNotifications,
} from "@/lib/notifications/app-notifications";
import { resolveExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { applySidebarNavOrder, parseSidebarNavOrder } from "@/lib/nav/sidebar-order";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  // 刷新报销开关缓存，供侧栏同步判断
  await resolveExpenseFeatureEnabled();
  const [navBase, userPrefs, pendingApprovalCount] = await Promise.all([
    getNavForRoleAsync(session.user.role),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { sidebarNavOrder: true },
    }),
    countPendingApprovals({
      id: session.user.id,
      role: session.user.role,
    }),
  ]);
  const nav = applySidebarNavOrder(
    navBase,
    parseSidebarNavOrder(userPrefs?.sidebarNavOrder)
  );
  const unreadNotificationCount = canAccessNotifications(session.user.role)
    ? await countUnreadNotifications(session.user.id)
    : 0;

  const impersonatorName = session.impersonator?.name ?? null;
  let impersonationTargets: ReturnType<typeof toImpersonationTargets> = [];

  if (!session.impersonator && canStartImpersonation(session.user.role)) {
    const targetRoles = getImpersonationTargetRoles(session.user.role);
    const users = await prisma.user.findMany({
      where: {
        id: { not: session.user.id },
        role: { in: targetRoles },
        OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
      },
      select: { id: true, name: true, role: true },
    });
    impersonationTargets = toImpersonationTargets(users);
  }

  return (
    <DashboardShell
      nav={nav}
      userName={session.user.name}
      roleLabel={ROLE_LABELS[session.user.role]}
      pendingApprovalCount={pendingApprovalCount}
      unreadNotificationCount={unreadNotificationCount}
      impersonationTargets={impersonationTargets}
      impersonatorName={impersonatorName}
      showMobileSwitch={canAccessSalesMobile(session.user.role)}
    >
      {children}
    </DashboardShell>
  );
}
