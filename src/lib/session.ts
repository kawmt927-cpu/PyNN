import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { authOptions } from "./auth";
import { preloadRolePermissions } from "@/lib/rbac/has-permission";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  await preloadRolePermissions(session.user.role);
  return session;
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) redirect("/");
  return session;
}
