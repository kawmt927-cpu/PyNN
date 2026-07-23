"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { staffCategoryForRole } from "@/lib/wecom/access-request";
import { normalizePhone, isValidCnMobile } from "@/lib/phone";

async function requireWeComApprover() {
  return requireRole(["ADMIN"]);
}

function revalidateWeComPaths() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/wecom-requests");
  revalidatePath("/admin/settings");
  revalidatePath("/mobile/wecom/unbound");
}

export async function approveWeComAccess(formData: FormData) {
  const session = await requireWeComApprover();

  const requestId = formData.get("requestId") as string;
  const mode = (formData.get("mode") as string) || "create";
  const role = formData.get("role") as UserRole;
  const name = (formData.get("name") as string)?.trim();
  const phone = normalizePhone((formData.get("phone") as string) ?? "");
  const existingUserId = (formData.get("existingUserId") as string)?.trim() || null;

  if (!requestId || !name || !phone || !role) {
    throw new Error("请填写完整信息");
  }
  if (!isValidCnMobile(phone)) {
    throw new Error("请输入有效的 11 位手机号");
  }

  const request = await prisma.weComAccessRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") {
    throw new Error("申请不存在或已处理");
  }

  const wecomTaken = await prisma.user.findUnique({ where: { wecomUserId: request.wecomUserId } });
  if (wecomTaken) throw new Error("该企微账号已绑定其他用户");

  await prisma.$transaction(async (tx) => {
    let userId: string;

    if (mode === "bind") {
      if (!existingUserId) throw new Error("请选择要绑定的 CRM 用户");
      const existing = await tx.user.findUnique({ where: { id: existingUserId } });
      if (!existing) throw new Error("用户不存在");
      if (existing.wecomUserId) throw new Error("该用户已绑定企微");

      const phoneConflict = await tx.user.findFirst({
        where: { phone, NOT: { id: existingUserId } },
      });
      if (phoneConflict) throw new Error("手机号已被其他账号使用");

      const data: {
        wecomUserId: string;
        name: string;
        phone: string;
        role: UserRole;
        passwordHash?: string;
      } = {
        wecomUserId: request.wecomUserId,
        name,
        phone,
        role,
      };
      if (request.passwordHash) {
        data.passwordHash = request.passwordHash;
      }

      const user = await tx.user.update({
        where: { id: existingUserId },
        data,
      });
      userId = user.id;
    } else {
      const phoneTaken = await tx.user.findUnique({ where: { phone } });
      if (phoneTaken) throw new Error("手机号已被使用，可改为「绑定到已有账号」");

      const passwordHash =
        request.passwordHash ?? (await bcrypt.hash(crypto.randomUUID(), 10));

      const user = await tx.user.create({
        data: {
          name,
          phone,
          email: null,
          role,
          passwordHash,
          wecomUserId: request.wecomUserId,
          personnelProfile: {
            create: {
              staffCategory: staffCategoryForRole(role),
              enabled: true,
            },
          },
        },
      });
      userId = user.id;
    }

    await tx.weComAccessRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewerId: session.user.id,
        reviewedAt: new Date(),
        userId,
        phone,
        name,
      },
    });
  });

  revalidateWeComPaths();
}

export async function rejectWeComAccess(formData: FormData) {
  const session = await requireWeComApprover();

  const requestId = formData.get("requestId") as string;
  const reviewNote = (formData.get("reviewNote") as string)?.trim() || undefined;

  if (!requestId) throw new Error("缺少申请 ID");

  const request = await prisma.weComAccessRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") {
    throw new Error("申请不存在或已处理");
  }

  await prisma.weComAccessRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewerId: session.user.id,
      reviewNote,
      reviewedAt: new Date(),
    },
  });

  revalidateWeComPaths();
}
