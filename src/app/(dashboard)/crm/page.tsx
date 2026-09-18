import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { resolvePrimaryNav } from "@/lib/nav/primary-nav";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 业务入口：跳到当前角色第一个可见子页（客户 / 商机 / 合同） */
export default async function CrmHubPage() {
  const session = await requireSession();
  const nav = resolvePrimaryNav(session.user.role, hasPermissionSync);
  const crm = nav.find((i) => i.id === "crm");
  redirect(crm?.href ?? "/customers");
}
