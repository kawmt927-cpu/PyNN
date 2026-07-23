import { getNavForRole, ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserRole } from "@prisma/client";
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

const APPROVAL_NAV_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const nav = getNavForRole(session.user.role);
  const pendingApprovalCount = APPROVAL_NAV_ROLES.includes(session.user.role)
    ? await countPendingApprovals()
    : 0;
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
