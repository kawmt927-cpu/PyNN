import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { resolvePrimaryNav } from "@/lib/nav/primary-nav";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 人员中心入口：按角色落到第一个可见 Tab */
export default async function PeopleHubPage() {
  const session = await requireSession();
  const nav = resolvePrimaryNav(session.user.role, hasPermissionSync);
  const people = nav.find((i) => i.id === "people");
  redirect(people?.href ?? "/personnel");
}
