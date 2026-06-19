import { getNavForRole, ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const nav = getNavForRole(session.user.role);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        nav={nav}
        userName={session.user.name}
        roleLabel={ROLE_LABELS[session.user.role]}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
