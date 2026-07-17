import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";

export default async function MobileSalesAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(SALES_MOBILE_ROLES);
  return children;
}
