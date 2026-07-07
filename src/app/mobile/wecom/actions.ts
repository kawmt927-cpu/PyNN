"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function applyWeComAccess(formData: FormData) {
  const wecomUserId = (formData.get("wecomUserId") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const message = (formData.get("message") as string)?.trim() || undefined;

  if (!wecomUserId || !name || !email) {
    throw new Error("请填写姓名和企业邮箱");
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ wecomUserId }, { email }] },
  });
  if (existingUser?.wecomUserId === wecomUserId) {
    throw new Error("该企微账号已开通，请重新扫码登录");
  }
  if (existingUser?.email === email) {
    throw new Error("该邮箱已被其他账号使用，请联系管理员");
  }

  const pending = await prisma.weComAccessRequest.findFirst({
    where: { wecomUserId, status: "PENDING" },
  });
  if (pending) {
    throw new Error("您已提交申请，请等待管理员审批");
  }

  await prisma.weComAccessRequest.create({
    data: { wecomUserId, name, email, message },
  });

  revalidatePath("/mobile/wecom/unbound");
  revalidatePath("/admin/settings");
}
