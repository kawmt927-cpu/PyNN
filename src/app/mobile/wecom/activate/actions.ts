"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizePhone, isValidCnMobile } from "@/lib/phone";
import { WECOM_PENDING_USER_COOKIE } from "@/lib/wecom/oauth-flow";
import { getMobileHomeForRole } from "@/lib/mobile/sales-roles";
import { isPhoneOrWeComUserAgent } from "@/lib/mobile/device";
import { getDefaultHomeForRole } from "@/lib/permissions";
import { createWeComSessionCookie } from "@/lib/wecom/api";
import { UI_MODE_COOKIE, UI_MODE_COOKIE_OPTIONS } from "@/lib/mobile/ui-mode";

export type ActivateResult = { error?: string };

export async function activateWeComUser(formData: FormData): Promise<ActivateResult> {
  const cookieStore = await cookies();
  const pendingWecomId = cookieStore.get(WECOM_PENDING_USER_COOKIE)?.value;
  const wecomUserId = (formData.get("wecomUserId") as string)?.trim();
  const phone = normalizePhone((formData.get("phone") as string) ?? "");
  const password = (formData.get("password") as string) ?? "";
  const passwordConfirm = (formData.get("passwordConfirm") as string) ?? "";

  if (!pendingWecomId || !wecomUserId || pendingWecomId !== wecomUserId) {
    return { error: "企微身份已过期，请重新扫码" };
  }
  if (!isValidCnMobile(phone)) {
    return { error: "请输入有效的 11 位手机号" };
  }
  if (password.length < 6) {
    return { error: "密码至少 6 位" };
  }
  if (password !== passwordConfirm) {
    return { error: "两次输入的密码不一致" };
  }

  const user = await prisma.user.findUnique({
    where: { wecomUserId },
    include: { personnelProfile: { select: { enabled: true } } },
  });
  if (!user) {
    return { error: "未找到预建账号，请走开通申请" };
  }
  if (user.personnelProfile && !user.personnelProfile.enabled) {
    return { error: "账号已停用，请联系管理员" };
  }

  const phoneTaken = await prisma.user.findFirst({
    where: { phone, NOT: { id: user.id } },
  });
  if (phoneTaken) {
    return { error: "该手机号已被其他账号使用" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { phone, passwordHash },
  });

  const ua = (await headers()).get("user-agent") ?? "";
  const onPhone = isPhoneOrWeComUserAgent(ua);

  const cookie = await createWeComSessionCookie(updated);
  cookieStore.set(cookie.name, cookie.value, cookie.options);
  cookieStore.delete(WECOM_PENDING_USER_COOKIE);
  cookieStore.set(UI_MODE_COOKIE, onPhone ? "mobile" : "pc", UI_MODE_COOKIE_OPTIONS);

  redirect(onPhone ? getMobileHomeForRole(updated.role) : getDefaultHomeForRole(updated.role));
}
