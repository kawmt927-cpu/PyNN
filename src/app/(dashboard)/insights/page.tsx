import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { resolvePrimaryNav } from "@/lib/nav/primary-nav";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 经营洞察入口 */
export default async function InsightsHubPage() {
  const session = await requireSession();
  const nav = resolvePrimaryNav(session.user.role, hasPermissionSync);
  const insights = nav.find((i) => i.id === "insights");
  redirect(insights?.href ?? "/admin/ops");
}
