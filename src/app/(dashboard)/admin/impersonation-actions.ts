"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth/session-cookie";
import { getDefaultHomeForRole } from "@/lib/permissions";
import {
  canImpersonateTarget,
  canStartImpersonation,
} from "@/lib/auth/impersonation";
import { getMobileHomeForRole } from "@/lib/mobile/sales-roles";
import { isPhoneOrWeComUserAgent } from "@/lib/mobile/device";

async function redirectAfterImpersonation(role: UserRole) {
  const ua = (await headers()).get("user-agent") ?? "";
  if (isPhoneOrWeComUserAgent(ua)) {
    redirect(getMobileHomeForRole(role));
  }
  redirect(getDefaultHomeForRole(role));
}

export async function startImpersonation(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.impersonator) {
    throw new Error("请先退出当前切换，再选择其他账号");
  }
  if (!canStartImpersonation(session.user.role)) {
    throw new Error("当前角色无权切换账号");
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId) throw new Error("缺少用户");
  if (targetUserId === session.user.id) throw new Error("不能切换到自己");

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { personnelProfile: { select: { enabled: true } } },
  });
  if (!target) throw new Error("用户不存在");
  if (target.personnelProfile && !target.personnelProfile.enabled) {
    throw new Error("该账号已停用");
  }
  if (!canImpersonateTarget(session.user.role, target.role)) {
    throw new Error("不可切换到该角色");
  }

  const cookie = await createSessionCookie(
    {
      id: target.id,
      email: target.email,
      name: target.name,
      role: target.role,
      phone: target.phone,
    },
    { id: session.user.id, name: session.user.name }
  );

  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.options);
  await redirectAfterImpersonation(target.role);
}

export async function stopImpersonation() {
  const session = await getServerSession(authOptions);
  if (!session?.impersonator) {
    redirect("/login");
  }

  const actor = await prisma.user.findUnique({
    where: { id: session.impersonator.id },
    include: { personnelProfile: { select: { enabled: true } } },
  });
  if (!actor || !canStartImpersonation(actor.role)) {
    redirect("/login");
  }
  if (actor.personnelProfile && !actor.personnelProfile.enabled) {
    redirect("/login");
  }

  const cookie = await createSessionCookie({
    id: actor.id,
    email: actor.email,
    name: actor.name,
    role: actor.role,
    phone: actor.phone,
  });

  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.options);
  await redirectAfterImpersonation(actor.role);
}
