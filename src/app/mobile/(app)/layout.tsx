import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import {
  canAccessSalesMobile,
  isMobileManagerRole,
} from "@/lib/mobile/sales-roles";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { countPendingApprovals } from "@/lib/approvals/pending-count";

export default async function MobileSalesAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  if (!canAccessSalesMobile(session.user.role)) {
    redirect("/mobile/pc-only");
  }

  const manager = isMobileManagerRole(session.user.role);
  const pendingApprovals = manager ? await countPendingApprovals() : 0;

  return (
    <MobileShell navVariant={manager ? "manager" : "sales"} moreBadge={pendingApprovals > 0}>
      {children}
    </MobileShell>
  );
}
