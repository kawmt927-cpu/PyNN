import { redirect } from "next/navigation";
import { getDefaultHomeForRole } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  redirect(getDefaultHomeForRole(session.user.role));
}
