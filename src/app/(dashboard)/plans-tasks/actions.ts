"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { weeklyAssignmentFormSchema } from "@/lib/validations/weekly-assignment";
import {
  salesAnnualTargetFormSchema,
  salesMonthlyTargetFormSchema,
} from "@/lib/validations/sales-target";
import { monthlyKpiTargetFormSchema } from "@/lib/validations/monthly-kpi";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";

function revalidatePlansTasks() {
  revalidatePath("/plans-tasks");
  revalidatePath("/today-work");
  revalidatePath("/weekly-tasks");
}

export async function saveAnnualTarget(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const parsed = salesAnnualTargetFormSchema.safeParse({
    userId: formData.get("userId"),
    year: formData.get("year"),
    salesTarget: formData.get("salesTarget"),
    profitTarget: formData.get("profitTarget"),
    paymentTarget: formData.get("paymentTarget"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "数据无效" };
  }

  await prisma.salesTarget.upsert({
    where: { userId_year: { userId: parsed.data.userId, year: parsed.data.year } },
    create: {
      userId: parsed.data.userId,
      year: parsed.data.year,
      salesTarget: parsed.data.salesTarget,
      costTarget: 0,
      profitTarget: parsed.data.profitTarget,
      paymentTarget: parsed.data.paymentTarget,
    },
    update: {
      salesTarget: parsed.data.salesTarget,
      profitTarget: parsed.data.profitTarget,
      paymentTarget: parsed.data.paymentTarget,
    },
  });

  revalidatePlansTasks();
  return { ok: true };
}

export async function saveMonthlyTarget(formData: FormData) {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const parsed = salesMonthlyTargetFormSchema.parse({
    userId: formData.get("userId"),
    year: formData.get("year"),
    month: formData.get("month"),
    salesTarget: formData.get("salesTarget"),
    costTarget: formData.get("costTarget"),
    profitTarget: formData.get("profitTarget"),
    paymentTarget: formData.get("paymentTarget"),
  });

  await prisma.salesMonthlyTarget.upsert({
    where: {
      userId_year_month: {
        userId: parsed.userId,
        year: parsed.year,
        month: parsed.month,
      },
    },
    create: {
      userId: parsed.userId,
      year: parsed.year,
      month: parsed.month,
      salesTarget: parsed.salesTarget,
      costTarget: parsed.costTarget,
      profitTarget: parsed.profitTarget,
      paymentTarget: parsed.paymentTarget,
    },
    update: {
      salesTarget: parsed.salesTarget,
      costTarget: parsed.costTarget,
      profitTarget: parsed.profitTarget,
      paymentTarget: parsed.paymentTarget,
    },
  });

  revalidatePlansTasks();
}

export async function saveMonthlyKpiTargets(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const parsed = monthlyKpiTargetFormSchema.safeParse({
    userId: formData.get("userId"),
    year: formData.get("year"),
    month: formData.get("month"),
    channelDevTarget: formData.get("channelDevTarget") || null,
    projectDevTarget: formData.get("projectDevTarget") || null,
    paymentCollectionTarget: formData.get("paymentCollectionTarget") || null,
    maintenanceTarget: formData.get("maintenanceTarget") || null,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "数据无效" };
  }

  const kpiData = {
    channelDevTarget: parsed.data.channelDevTarget ?? null,
    projectDevTarget: parsed.data.projectDevTarget ?? null,
    paymentCollectionTarget: parsed.data.paymentCollectionTarget ?? null,
    maintenanceTarget: parsed.data.maintenanceTarget ?? null,
  };

  const existing = await prisma.salesMonthlyTarget.findUnique({
    where: {
      userId_year_month: {
        userId: parsed.data.userId,
        year: parsed.data.year,
        month: parsed.data.month,
      },
    },
  });

  if (existing) {
    await prisma.salesMonthlyTarget.update({
      where: { id: existing.id },
      data: kpiData,
    });
  } else {
    await prisma.salesMonthlyTarget.create({
      data: {
        userId: parsed.data.userId,
        year: parsed.data.year,
        month: parsed.data.month,
        salesTarget: 0,
        costTarget: 0,
        profitTarget: 0,
        paymentTarget: 0,
        ...kpiData,
      },
    });
  }

  revalidatePlansTasks();
  return { ok: true };
}

export async function createWeeklyAssignment(formData: FormData) {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);

  const parsed = weeklyAssignmentFormSchema.parse({
    assigneeId: formData.get("assigneeId"),
    customerId: formData.get("customerId")?.toString() || undefined,
    opportunityId: formData.get("opportunityId")?.toString() || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dueAt: formData.get("dueAt"),
  });

  let customerId = parsed.customerId;
  let opportunityId = parsed.opportunityId;

  if (parsed.opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: parsed.opportunityId },
      select: { id: true, customerId: true },
    });
    if (!opportunity) throw new Error("商机不存在");
    opportunityId = opportunity.id;
    customerId = opportunity.customerId;
  }

  await prisma.salesWeeklyAssignment.create({
    data: {
      createdById: session.user.id,
      assigneeId: parsed.assigneeId,
      customerId: customerId || undefined,
      opportunityId: opportunityId || undefined,
      title: parsed.title,
      description: parsed.description,
      dueAt: new Date(parsed.dueAt),
    },
  });

  revalidatePlansTasks();
}

export async function cancelWeeklyAssignment(id: string) {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
  if (!canManageWeeklyAssignments(session.user.role)) {
    throw new Error("无权取消任务");
  }

  const existing = await prisma.salesWeeklyAssignment.findUnique({ where: { id } });
  if (!existing) throw new Error("任务不存在");
  if (existing.status !== "PENDING") throw new Error("只能取消待完成的任务");

  await prisma.salesWeeklyAssignment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePlansTasks();
}
