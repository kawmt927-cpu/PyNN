"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { configOptionSchema } from "@/lib/validations/customer";
import { generateConfigOptionValue } from "@/lib/config-options";
import { clearConfigOptionReferences } from "@/lib/config-options-cleanup";

export async function bindWeComUser(formData: FormData) {
  await requireRole(["ADMIN"]);

  const userId = formData.get("userId") as string;
  const wecomUserId = (formData.get("wecomUserId") as string)?.trim();

  if (!userId || !wecomUserId) {
    throw new Error("请选择用户并填写企业微信 UserID");
  }

  const existing = await prisma.user.findUnique({ where: { wecomUserId } });
  if (existing && existing.id !== userId) {
    throw new Error("该企业微信 UserID 已绑定其他账号");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { wecomUserId },
  });

  revalidatePath("/admin/settings");
}

export async function unbindWeComUser(formData: FormData) {
  await requireRole(["ADMIN"]);

  const userId = formData.get("userId") as string;
  if (!userId) throw new Error("缺少用户 ID");

  await prisma.user.update({
    where: { id: userId },
    data: { wecomUserId: null },
  });

  revalidatePath("/admin/settings");
}

export async function createConfigOption(formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = configOptionSchema.parse({
    category: formData.get("category"),
    label: formData.get("label"),
    sortOrder: formData.get("sortOrder") || 0,
  });

  const label = parsed.label.trim();
  const duplicateLabel = await prisma.configOption.findFirst({
    where: { category: parsed.category, label },
  });
  if (duplicateLabel) throw new Error("该显示名称已存在");

  const value = generateConfigOptionValue(parsed.category);

  await prisma.configOption.create({
    data: {
      category: parsed.category,
      value,
      label,
      sortOrder: parsed.sortOrder ?? 0,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
}

export async function updateConfigOptionLabel(formData: FormData) {
  await requireRole(["ADMIN"]);

  const id = formData.get("id") as string;
  const label = (formData.get("label") as string)?.trim();
  if (!id || !label) throw new Error("参数不完整");

  const option = await prisma.configOption.findUnique({ where: { id } });
  if (!option) throw new Error("选项不存在");

  const duplicateLabel = await prisma.configOption.findFirst({
    where: { category: option.category, label, id: { not: id } },
  });
  if (duplicateLabel) throw new Error("该显示名称已存在");

  await prisma.configOption.update({
    where: { id },
    data: { label },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
}

export async function deleteConfigOption(formData: FormData) {
  await requireRole(["ADMIN"]);

  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少选项 ID");

  const option = await prisma.configOption.findUnique({ where: { id } });
  if (!option) throw new Error("选项不存在");

  await prisma.$transaction(async (tx) => {
    await clearConfigOptionReferences(tx, option.category, option.value);
    await tx.configOption.delete({ where: { id } });
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
  revalidatePath("/follow-ups");
}

export async function toggleConfigOption(formData: FormData) {
  await requireRole(["ADMIN"]);

  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少选项 ID");

  const option = await prisma.configOption.findUnique({ where: { id } });
  if (!option) throw new Error("选项不存在");

  await prisma.configOption.update({
    where: { id },
    data: { enabled: !option.enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
}
