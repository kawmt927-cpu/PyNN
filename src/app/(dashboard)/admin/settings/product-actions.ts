"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";

const productTemplateSchema = z.object({
  name: z.string().min(1, "请输入产品名称"),
  description: z.string().optional(),
  baselineCostPrice: z.coerce.number().min(0, "默认成本不能为负"),
});

function formatError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

export async function createProductTemplate(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole(["SALES_MANAGER", "ADMIN"]);
    const parsed = productTemplateSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      baselineCostPrice: formData.get("baselineCostPrice"),
    });

    await prisma.productServiceTemplate.create({
      data: {
        name: parsed.name.trim(),
        description: parsed.description?.trim() || undefined,
        baselineCostPrice: parsed.baselineCostPrice,
      },
    });

    revalidatePath("/admin/settings");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProductTemplate(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole(["SALES_MANAGER", "ADMIN"]);
    const id = formData.get("id")?.toString();
    if (!id) return { error: "缺少 ID" };

    const parsed = productTemplateSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      baselineCostPrice: formData.get("baselineCostPrice"),
    });

    await prisma.productServiceTemplate.update({
      where: { id },
      data: {
        name: parsed.name.trim(),
        description: parsed.description?.trim() || undefined,
        baselineCostPrice: parsed.baselineCostPrice,
        enabled: formData.get("enabled") === "on",
      },
    });

    revalidatePath("/admin/settings");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteProductTemplate(id: string): Promise<ActionResult> {
  try {
    await requireRole(["SALES_MANAGER", "ADMIN"]);
    await prisma.productServiceTemplate.delete({ where: { id } });
    revalidatePath("/admin/settings");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
