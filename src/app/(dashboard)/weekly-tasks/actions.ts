"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import { z } from "zod";
import { weeklyAssignmentFormSchema } from "@/lib/validations/weekly-assignment";
import type { ActionResult } from "@/lib/action-result";

export async function createWeeklyAssignment(formData: FormData): Promise<ActionResult> {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
  if (!canManageWeeklyAssignments(session.user.role)) {
    return { error: "无权操作" };
  }

  try {
    const parsed = weeklyAssignmentFormSchema.parse({
      assigneeId: formData.get("assigneeId"),
      customerId: formData.get("customerId")?.toString() || undefined,
      opportunityId: formData.get("opportunityId")?.toString() || undefined,
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      dueAt: formData.get("dueAt"),
    });

    const dueAt = new Date(parsed.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return { error: "截止时间无效" };
    }

    if (parsed.opportunityId) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: parsed.opportunityId },
        select: { id: true, customerId: true },
      });
      if (!opportunity) return { error: "商机不存在" };
      await prisma.salesWeeklyAssignment.create({
        data: {
          createdById: session.user.id,
          assigneeId: parsed.assigneeId,
          customerId: opportunity.customerId,
          opportunityId: opportunity.id,
          title: parsed.title.trim(),
          description: parsed.description?.trim() || null,
          dueAt,
        },
      });
    } else if (parsed.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: parsed.customerId },
        select: { id: true },
      });
      if (!customer) return { error: "客户不存在" };
      await prisma.salesWeeklyAssignment.create({
        data: {
          createdById: session.user.id,
          assigneeId: parsed.assigneeId,
          customerId: customer.id,
          title: parsed.title.trim(),
          description: parsed.description?.trim() || null,
          dueAt,
        },
      });
    }

    revalidatePath("/weekly-tasks");
    revalidatePath("/today-work");
    return {};
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message ?? "表单无效" };
    }
    return { error: error instanceof Error ? error.message : "创建失败" };
  }
}

export async function cancelWeeklyAssignment(id: string): Promise<ActionResult> {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
  if (!canManageWeeklyAssignments(session.user.role)) {
    return { error: "无权操作" };
  }

  await prisma.salesWeeklyAssignment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/weekly-tasks");
  revalidatePath("/today-work");
  return {};
}
