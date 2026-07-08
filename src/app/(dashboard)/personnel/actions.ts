"use server";

import { revalidatePath } from "next/cache";
import { PersonnelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

export async function updatePersonnelProfile(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole(["PROJECT_ADMIN", "ADMIN"]);
    const userId = formData.get("userId")?.toString();
    if (!userId) return { error: "缺少用户 ID" };

    const dailyRateRaw = formData.get("dailyRate")?.toString();
    const dailyRate = dailyRateRaw ? Number(dailyRateRaw) : null;
    if (dailyRate != null && (Number.isNaN(dailyRate) || dailyRate < 0)) {
      return { error: "日单价无效" };
    }

    const personnelTypeRaw = formData.get("personnelType")?.toString();
    const personnelType =
      personnelTypeRaw && personnelTypeRaw !== "NONE"
        ? (personnelTypeRaw as PersonnelType)
        : null;

    const profile = await prisma.personnelProfile.findUnique({ where: { userId } });
    if (!profile || profile.staffCategory !== "IMPLEMENTATION") {
      return { error: "用户不是实施人员" };
    }

    await prisma.personnelProfile.update({
      where: { userId },
      data: { dailyRate, personnelType },
    });

    revalidatePath("/personnel");
    revalidatePath("/admin/users");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
