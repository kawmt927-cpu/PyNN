import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { resolvePrimaryNav } from "@/lib/nav/primary-nav";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 工作台入口：跳到当前角色第一个可见子页 */
export default async function WorkHubPage() {
  const session = await requireSession();
  const nav = resolvePrimaryNav(session.user.role, hasPermissionSync);
  const work = nav.find((i) => i.id === "work");
  redirect(work?.href ?? "/today-work");
}
