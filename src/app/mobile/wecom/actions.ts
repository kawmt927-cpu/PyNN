"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizePhone, isValidCnMobile } from "@/lib/phone";
import { WECOM_PENDING_USER_COOKIE } from "@/lib/wecom/oauth-flow";

export async function applyWeComAccess(formData: FormData) {
  const wecomUserId = (formData.get("wecomUserId") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const phoneRaw = (formData.get("phone") as string) ?? "";
  const phone = normalizePhone(phoneRaw);
  const password = (formData.get("password") as string) ?? "";
  const passwordConfirm = (formData.get("passwordConfirm") as string) ?? "";
  const message = (formData.get("message") as string)?.trim() || undefined;

  if (!wecomUserId || !name || !phone) {
    throw new Error("请填写姓名和手机号");
  }
  if (!isValidCnMobile(phone)) {
    throw new Error("请输入有效的 11 位手机号");
  }
  if (password.length < 6) {
    throw new Error("密码至少 6 位");
  }
  if (password !== passwordConfirm) {
    throw new Error("两次输入的密码不一致");
  }

  const cookieStore = await cookies();
  const pendingWecomId = cookieStore.get(WECOM_PENDING_USER_COOKIE)?.value;
  if (!pendingWecomId || pendingWecomId !== wecomUserId) {
    throw new Error("企微身份已过期，请重新扫码后再提交申请");
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ wecomUserId }, { phone }] },
  });
  if (existingUser?.wecomUserId === wecomUserId) {
    throw new Error("该企微账号已开通，请重新扫码登录");
  }
  if (existingUser?.phone === phone) {
    throw new Error("该手机号已被其他账号使用，请联系管理员");
  }

  const pending = await prisma.weComAccessRequest.findFirst({
    where: { wecomUserId, status: "PENDING" },
  });
  if (pending) {
    throw new Error("您已提交申请，请等待管理员审批");
  }

  const phonePending = await prisma.weComAccessRequest.findFirst({
    where: { phone, status: "PENDING" },
  });
  if (phonePending && phonePending.wecomUserId !== wecomUserId) {
    throw new Error("该手机号已有待审申请，请联系管理员");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // 拒绝后允许重提：关闭旧的 REJECTED 记录影响展示，直接新建 PENDING
  await prisma.weComAccessRequest.create({
    data: { wecomUserId, name, phone, passwordHash, message },
  });

  revalidatePath("/mobile/wecom/unbound");
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/wecom-requests");
  revalidatePath("/admin/settings");
}
