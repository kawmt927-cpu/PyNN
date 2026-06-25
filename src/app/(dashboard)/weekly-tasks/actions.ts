"use server";

import { revalidatePath } from "next/cache";
import { FollowUpMethod } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import { weeklyAssignmentFormSchema } from "@/lib/validations/weekly-assignment";
import {
  cancelWeeklyAssignmentWithPlan,
  createWeeklyAssignmentWithFollowUpPlan,
} from "@/lib/today-work/create-weekly-assignment";
import type { ActionResult } from "@/lib/action-result";
import { z } from "zod";

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
      contactId: formData.get("contactId")?.toString() || undefined,
      plannedMethod: formData.get("plannedMethod")?.toString() || undefined,
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      dueAt: formData.get("dueAt"),
    });

    const dueAt = new Date(parsed.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return { error: "截止时间无效" };
    }

    const plannedMethod = parsed.plannedMethod?.trim()
      ? (parsed.plannedMethod.trim() as FollowUpMethod)
      : null;

    await createWeeklyAssignmentWithFollowUpPlan({
      createdById: session.user.id,
      assigneeId: parsed.assigneeId,
      customerId: parsed.customerId,
      opportunityId: parsed.opportunityId?.trim() || null,
      contactId: parsed.contactId?.trim() || null,
      plannedMethod,
      title: parsed.title,
      description: parsed.description,
      dueAt,
    });

    revalidatePath("/weekly-tasks");
    revalidatePath("/today-work");
    revalidatePath("/plans-tasks");
    revalidatePath("/follow-ups");
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

  try {
    await prisma.$transaction(async (tx) => {
      await cancelWeeklyAssignmentWithPlan(tx, id);
    });

    revalidatePath("/weekly-tasks");
    revalidatePath("/today-work");
    revalidatePath("/plans-tasks");
    revalidatePath("/follow-ups");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "取消失败" };
  }
}
