"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canManageProject, getProjectForUser } from "@/lib/projects/access";
import { parseDateOnlyInput } from "@/lib/validations/project";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

async function requireProjectAccess(projectId: string, manage = false) {
  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
  ]);
  const project = await getProjectForUser(
    projectId,
    session.user.role,
    session.user.id
  );
  if (!project) throw new Error("项目不存在或无权访问");
  if (manage && !canManageProject(session.user.role, session.user.id, project)) {
    throw new Error("无权修改该项目");
  }
  return { session, project };
}

async function resolveStaffDailyRate(userId: string): Promise<number> {
  const profile = await prisma.personnelProfile.findUnique({
    where: { userId },
    select: { dailyRate: true, enabled: true, staffCategory: true },
  });
  if (!profile?.enabled || profile.staffCategory !== "IMPLEMENTATION") {
    throw new Error("实施人员无效或未启用");
  }
  if (profile.dailyRate == null) throw new Error("该人员未设置日单价");
  return Number(profile.dailyRate);
}

function revalidateAllocationPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/personnel");
  revalidatePath("/projects/schedule");
}

export async function createProjectAllocation(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    await requireProjectAccess(projectId, true);

    const userId = formData.get("userId")?.toString();
    if (!userId) return { error: "请选择人员" };

    const startDate = parseDateOnlyInput(formData.get("startDate")?.toString());
    const endDate = parseDateOnlyInput(formData.get("endDate")?.toString());
    if (startDate > endDate) throw new Error("结束日期不能早于开始日期");

    const allocationMode =
      formData.get("allocationMode")?.toString() === "MANUAL" ? "MANUAL" : "AUTO";
    const plannedDaysRaw = formData.get("plannedDays")?.toString();
    const plannedDays =
      allocationMode === "MANUAL" && plannedDaysRaw ? Number(plannedDaysRaw) : null;
    if (allocationMode === "MANUAL" && (plannedDays == null || plannedDays <= 0)) {
      throw new Error("手动模式须填写总人天");
    }

    const splitWeightRaw = formData.get("splitWeight")?.toString();
    const splitWeight = splitWeightRaw ? Number(splitWeightRaw) : null;
    const dailyRateSnapshot = await resolveStaffDailyRate(userId);

    await prisma.projectStaffAllocation.create({
      data: {
        projectId,
        userId,
        phaseId: formData.get("phaseId")?.toString() || null,
        startDate,
        endDate,
        allocationMode,
        plannedDays,
        splitWeight,
        dailyRateSnapshot,
        notes: formData.get("notes")?.toString()?.trim() || null,
      },
    });

    revalidateAllocationPaths(projectId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectAllocation(formData: FormData): Promise<ActionResult> {
  try {
    const allocationId = formData.get("allocationId")?.toString();
    const projectId = formData.get("projectId")?.toString();
    if (!allocationId || !projectId) return { error: "缺少参数" };
    await requireProjectAccess(projectId, true);

    const startDate = parseDateOnlyInput(formData.get("startDate")?.toString());
    const endDate = parseDateOnlyInput(formData.get("endDate")?.toString());
    if (startDate > endDate) throw new Error("结束日期不能早于开始日期");

    const allocationMode =
      formData.get("allocationMode")?.toString() === "MANUAL" ? "MANUAL" : "AUTO";
    const plannedDaysRaw = formData.get("plannedDays")?.toString();
    const plannedDays =
      allocationMode === "MANUAL" && plannedDaysRaw ? Number(plannedDaysRaw) : null;
    if (allocationMode === "MANUAL" && (plannedDays == null || plannedDays <= 0)) {
      throw new Error("手动模式须填写总人天");
    }

    const splitWeightRaw = formData.get("splitWeight")?.toString();
    const splitWeight = splitWeightRaw ? Number(splitWeightRaw) : null;

    await prisma.projectStaffAllocation.update({
      where: { id: allocationId },
      data: {
        startDate,
        endDate,
        allocationMode,
        plannedDays,
        splitWeight,
        phaseId: formData.get("phaseId")?.toString() || null,
        notes: formData.get("notes")?.toString()?.trim() || null,
      },
    });

    revalidateAllocationPaths(projectId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function createProjectAllocationFromDrag(input: {
  projectId: string;
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<ActionResult> {
  const fd = new FormData();
  fd.set("projectId", input.projectId);
  fd.set("userId", input.userId);
  fd.set("startDate", input.startDate);
  fd.set("endDate", input.endDate);
  fd.set("allocationMode", "AUTO");
  return createProjectAllocation(fd);
}

export async function deleteProjectAllocation(formData: FormData): Promise<ActionResult> {
  try {
    const allocationId = formData.get("allocationId")?.toString();
    const projectId = formData.get("projectId")?.toString();
    if (!allocationId || !projectId) return { error: "缺少参数" };
    await requireProjectAccess(projectId, true);

    await prisma.projectStaffAllocation.delete({ where: { id: allocationId } });
    revalidateAllocationPaths(projectId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}
