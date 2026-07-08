import { getNavForRole, ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserRole } from "@prisma/client";

const APPROVAL_NAV_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const nav = getNavForRole(session.user.role);
  const pendingApprovalCount = APPROVAL_NAV_ROLES.includes(session.user.role)
    ? await countPendingApprovals()
    : 0;

  return (
    <DashboardShell
      nav={nav}
      userName={session.user.name}
      roleLabel={ROLE_LABELS[session.user.role]}
      pendingApprovalCount={pendingApprovalCount}
    >
      {children}
    </DashboardShell>
  );
}
