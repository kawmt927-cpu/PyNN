import { getNavForRole, ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { UserRole } from "@prisma/client";

const APPROVAL_NAV_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const nav = getNavForRole(session.user.role);
  const pendingApprovalCount = APPROVAL_NAV_ROLES.includes(session.user.role)
    ? await countPendingApprovals()
    : 0;

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        nav={nav}
        userName={session.user.name}
        roleLabel={ROLE_LABELS[session.user.role]}
        pendingApprovalCount={pendingApprovalCount}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
