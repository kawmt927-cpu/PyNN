"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireConfigCategoryManage,
  requireWeComSettingsAccess,
} from "@/lib/config-settings-access";
import { configOptionSchema, saveConfigCategoryOptionsSchema } from "@/lib/validations/customer";
import { generateConfigOptionValue } from "@/lib/config-options";
import { clearConfigOptionReferences } from "@/lib/config-options-cleanup";
import {
  nextConfigOptionSortOrder,
  renumberConfigOptions,
} from "@/lib/config-options-sort";

export async function bindWeComUser(formData: FormData) {
  await requireWeComSettingsAccess();

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
  await requireWeComSettingsAccess();

  const userId = formData.get("userId") as string;
  if (!userId) throw new Error("缺少用户 ID");

  await prisma.user.update({
    where: { id: userId },
    data: { wecomUserId: null },
  });

  revalidatePath("/admin/settings");
}

export async function createConfigOption(formData: FormData) {
  const parsed = configOptionSchema.parse({
    category: formData.get("category"),
    label: formData.get("label"),
  });

  await requireConfigCategoryManage(parsed.category);

  const label = parsed.label.trim();
  const duplicateLabel = await prisma.configOption.findFirst({
    where: { category: parsed.category, label },
  });
  if (duplicateLabel) throw new Error("该显示名称已存在");

  const value = generateConfigOptionValue(parsed.category);
  const sortOrder = await nextConfigOptionSortOrder(prisma, parsed.category);

  await prisma.configOption.create({
    data: {
      category: parsed.category,
      value,
      label,
      sortOrder,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
}

export async function updateConfigOptionLabel(formData: FormData) {
  const id = formData.get("id") as string;
  const label = (formData.get("label") as string)?.trim();
  if (!id || !label) throw new Error("参数不完整");

  const option = await prisma.configOption.findUnique({ where: { id } });
  if (!option) throw new Error("选项不存在");

  await requireConfigCategoryManage(option.category);

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
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少选项 ID");

  const option = await prisma.configOption.findUnique({ where: { id } });
  if (!option) throw new Error("选项不存在");

  await requireConfigCategoryManage(option.category);

  await prisma.$transaction(async (tx) => {
    await clearConfigOptionReferences(tx, option.category, option.value);
    await tx.configOption.delete({ where: { id } });
    await renumberConfigOptions(tx, option.category);
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
  revalidatePath("/follow-ups");
}

export async function reorderConfigOptions(formData: FormData) {
  const category = formData.get("category") as string;
  const orderedIdsRaw = formData.get("orderedIds") as string;
  if (!category || !orderedIdsRaw) throw new Error("缺少排序参数");

  await requireConfigCategoryManage(category);

  let orderedIds: string[];
  try {
    orderedIds = JSON.parse(orderedIdsRaw) as string[];
  } catch {
    throw new Error("排序数据格式无效");
  }

  const options = await prisma.configOption.findMany({
    where: { category },
    select: { id: true },
  });
  const validIds = new Set(options.map((o) => o.id));

  if (
    orderedIds.length !== options.length ||
    !orderedIds.every((id) => validIds.has(id))
  ) {
    throw new Error("排序列表与当前选项不一致");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.configOption.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
}

export async function saveConfigCategoryOptions(formData: FormData) {
  const category = formData.get("category") as string;
  const payloadRaw = formData.get("payload") as string;
  if (!category || !payloadRaw) throw new Error("缺少保存参数");

  await requireConfigCategoryManage(category);

  let items: Array<{ id: string | null; label: string; enabled: boolean }>;
  try {
    const parsed = saveConfigCategoryOptionsSchema.parse({
      category,
      items: JSON.parse(payloadRaw),
    });
    items = parsed.items.map((item) => ({
      ...item,
      label: item.label.trim(),
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(error.errors[0]?.message ?? "保存数据无效");
    }
    throw error;
  }

  const labels = items.map((item) => item.label);
  if (new Set(labels).size !== labels.length) {
    throw new Error("显示名称不能重复");
  }

  const existing = await prisma.configOption.findMany({
    where: { category },
  });
  const existingById = new Map(existing.map((opt) => [opt.id, opt]));
  const keptIds = new Set(
    items.map((item) => item.id).filter((id): id is string => Boolean(id))
  );

  for (const id of keptIds) {
    if (!existingById.has(id)) throw new Error("包含无效选项，请刷新后重试");
  }

  const toDelete = existing.filter((opt) => !keptIds.has(opt.id));

  await prisma.$transaction(async (tx) => {
    for (const opt of toDelete) {
      await clearConfigOptionReferences(tx, opt.category, opt.value);
      await tx.configOption.delete({ where: { id: opt.id } });
    }

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const sortOrder = index + 1;

      if (item.id) {
        await tx.configOption.update({
          where: { id: item.id },
          data: {
            label: item.label,
            enabled: item.enabled,
            sortOrder,
          },
        });
      } else {
        await tx.configOption.create({
          data: {
            category,
            value: generateConfigOptionValue(category),
            label: item.label,
            enabled: item.enabled,
            sortOrder,
          },
        });
      }
    }

    await renumberConfigOptions(tx, category);
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
  revalidatePath("/follow-ups");
}

export async function toggleConfigOption(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少选项 ID");

  const option = await prisma.configOption.findUnique({ where: { id } });
  if (!option) throw new Error("选项不存在");

  await requireConfigCategoryManage(option.category);

  await prisma.configOption.update({
    where: { id },
    data: { enabled: !option.enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/customers");
}
