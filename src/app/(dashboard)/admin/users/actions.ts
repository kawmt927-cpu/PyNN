"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StaffCategory, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { staffCategoryForRole } from "@/lib/wecom/access-request";
import { parseUserFormData } from "@/lib/validations/user";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

async function requireUserAdmin() {
  return requireRole(["ADMIN"]);
}

function profileDataForRole(
  role: UserRole,
  enabled: boolean,
  isPresales: boolean,
  dailyRate?: number
) {
  const staffCategory = staffCategoryForRole(role);
  const canPresales = staffCategory === StaffCategory.IMPLEMENTATION;
  return {
    staffCategory,
    enabled,
    isPresales: canPresales && isPresales,
    dailyRate: canPresales && isPresales && dailyRate != null ? dailyRate : null,
  };
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  try {
    await requireUserAdmin();
    const parsed = parseUserFormData(formData, "create");
    const password = parsed.password;
    if (!password) throw new Error("请设置密码");

    const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existing) throw new Error("邮箱已被使用");

    const passwordHash = await bcrypt.hash(password, 10);
    const profile = profileDataForRole(
      parsed.role,
      parsed.enabled ?? true,
      parsed.isPresales ?? false,
      parsed.dailyRate
    );

    if (profile.isPresales && profile.dailyRate == null) {
      throw new Error("售前人员须填写日单价");
    }

    await prisma.user.create({
      data: {
        name: parsed.name.trim(),
        email: parsed.email.trim().toLowerCase(),
        role: parsed.role,
        passwordHash,
        personnelProfile: { create: profile },
      },
    });

    revalidatePath("/admin/users");
    redirect("/admin/users");
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return formatError(error);
  }
}

export async function updateUser(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireUserAdmin();
    const id = formData.get("id")?.toString();
    if (!id) return { error: "缺少用户 ID" };

    if (id === session.user.id && formData.get("enabled") !== "on") {
      throw new Error("不能停用自己的账号");
    }

    const parsed = parseUserFormData(formData, "update");
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { personnelProfile: true },
    });
    if (!existing) throw new Error("用户不存在");

    const emailTaken = await prisma.user.findFirst({
      where: { email: parsed.email, NOT: { id } },
    });
    if (emailTaken) throw new Error("邮箱已被使用");

    const profile = profileDataForRole(
      parsed.role,
      parsed.enabled ?? true,
      parsed.isPresales ?? false,
      parsed.dailyRate
    );

    if (profile.isPresales && profile.dailyRate == null) {
      throw new Error("售前人员须填写日单价");
    }

    const data: {
      name: string;
      email: string;
      role: UserRole;
      passwordHash?: string;
    } = {
      name: parsed.name.trim(),
      email: parsed.email.trim().toLowerCase(),
      role: parsed.role,
    };

    if (parsed.password) {
      data.passwordHash = await bcrypt.hash(parsed.password, 10);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });

      if (existing.personnelProfile) {
        await tx.personnelProfile.update({
          where: { userId: id },
          data: profile,
        });
      } else {
        await tx.personnelProfile.create({
          data: { userId: id, ...profile },
        });
      }
    });

    revalidatePath("/admin/users");
    redirect("/admin/users");
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return formatError(error);
  }
}

export async function resetUserPassword(formData: FormData): Promise<ActionResult> {
  try {
    await requireUserAdmin();
    const id = formData.get("id")?.toString();
    const password = (formData.get("password") as string)?.trim();
    if (!id || !password || password.length < 6) {
      return { error: "请提供至少 6 位新密码" };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${id}/edit`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function unbindUserWecom(formData: FormData): Promise<void> {
  await requireUserAdmin();
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.user.update({ where: { id }, data: { wecomUserId: null } });
  revalidatePath("/admin/users");
}

export async function generateTempPassword(): Promise<string> {
  await requireUserAdmin();
  return crypto.randomBytes(4).toString("hex");
}
