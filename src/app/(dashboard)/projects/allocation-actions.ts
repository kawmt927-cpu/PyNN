"use server";

import { revalidatePath } from "next/cache";
import { AllocationMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canManageProject, getProjectForUser } from "@/lib/projects/access";
import {
  assertSegmentsNoOverlap,
  findOverlappingSegment,
} from "@/lib/projects/allocation-overlap";
import { trimOverlappingProjectAllocations } from "@/lib/projects/allocation-dedup";
import { parseDateOnlyInput } from "@/lib/validations/project";
import { toDateOnly } from "@/lib/projects/workdays";

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

async function assertNoOverlapWithProjectUser(
  projectId: string,
  userId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
) {
  const siblings = await prisma.projectStaffAllocation.findMany({
    where: {
      projectId,
      userId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true },
  });
  const overlap = findOverlappingSegment(startDate, endDate, siblings, excludeId);
  if (overlap) {
    throw new Error("该时间段与同项目其他排班分段重叠，请调整日期");
  }
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
      throw new Error("手动模式须填写单日人天");
    }
    if (allocationMode === "MANUAL" && plannedDays != null && plannedDays > 1) {
      throw new Error("单日人天不能超过 1");
    }

    await assertNoOverlapWithProjectUser(projectId, userId, startDate, endDate);

    const splitWeightRaw = formData.get("splitWeight")?.toString();
    const splitWeight = splitWeightRaw ? Number(splitWeightRaw) : null;
    const dailyRateSnapshot = await resolveStaffDailyRate(userId);

    const created = await prisma.projectStaffAllocation.create({
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
    return { allocationId: created.id };
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

    const current = await prisma.projectStaffAllocation.findUnique({
      where: { id: allocationId },
      select: { userId: true },
    });
    if (!current) throw new Error("投入记录不存在");

    await assertNoOverlapWithProjectUser(
      projectId,
      current.userId,
      startDate,
      endDate,
      allocationId
    );

    const allocationMode =
      formData.get("allocationMode")?.toString() === "MANUAL" ? "MANUAL" : "AUTO";
    const plannedDaysRaw = formData.get("plannedDays")?.toString();
    const plannedDays =
      allocationMode === "MANUAL" && plannedDaysRaw ? Number(plannedDaysRaw) : null;
    if (allocationMode === "MANUAL" && (plannedDays == null || plannedDays <= 0)) {
      throw new Error("手动模式须填写单日人天");
    }
    if (allocationMode === "MANUAL" && plannedDays != null && plannedDays > 1) {
      throw new Error("单日人天不能超过 1");
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

export type AllocationSegmentInput = {
  id?: string;
  startDate: string;
  endDate: string;
  allocationMode: AllocationMode;
  plannedDays?: number | null;
  notes?: string | null;
};

export async function saveProjectUserAllocationSegments(input: {
  projectId: string;
  userId: string;
  segments: AllocationSegmentInput[];
}): Promise<ActionResult> {
  try {
    await requireProjectAccess(input.projectId, true);
    if (input.segments.length === 0) throw new Error("至少保留一个排班分段");

    const parsed = input.segments.map((segment) => {
      const startDate = toDateOnly(parseDateOnlyInput(segment.startDate));
      const endDate = toDateOnly(parseDateOnlyInput(segment.endDate));
      if (startDate.getTime() > endDate.getTime()) {
        throw new Error("结束日期不能早于开始日期");
      }
      const allocationMode = segment.allocationMode;
      const plannedDays =
        allocationMode === "MANUAL" && segment.plannedDays != null
          ? segment.plannedDays
          : null;
      if (allocationMode === "MANUAL" && (plannedDays == null || plannedDays <= 0)) {
        throw new Error("手动模式须填写单日人天");
      }
      if (allocationMode === "MANUAL" && plannedDays != null && plannedDays > 1) {
        throw new Error("单日人天不能超过 1");
      }
      return {
        id: segment.id,
        startDate,
        endDate,
        allocationMode,
        plannedDays,
        notes: segment.notes?.trim() || null,
      };
    });

    assertSegmentsNoOverlap(parsed);

    const dailyRateSnapshot = await resolveStaffDailyRate(input.userId);
    const existing = await prisma.projectStaffAllocation.findMany({
      where: { projectId: input.projectId, userId: input.userId },
      select: { id: true },
    });
    const keepIds = new Set(parsed.filter((s) => s.id).map((s) => s.id!));
    const deleteIds = existing.map((row) => row.id).filter((id) => !keepIds.has(id));

    await prisma.$transaction(async (tx) => {
      if (deleteIds.length > 0) {
        await tx.projectStaffAllocation.deleteMany({ where: { id: { in: deleteIds } } });
      }
      for (const segment of parsed) {
        if (segment.id) {
          await tx.projectStaffAllocation.update({
            where: { id: segment.id },
            data: {
              startDate: segment.startDate,
              endDate: segment.endDate,
              allocationMode: segment.allocationMode,
              plannedDays: segment.plannedDays,
              notes: segment.notes,
            },
          });
        } else {
          await tx.projectStaffAllocation.create({
            data: {
              projectId: input.projectId,
              userId: input.userId,
              startDate: segment.startDate,
              endDate: segment.endDate,
              allocationMode: segment.allocationMode,
              plannedDays: segment.plannedDays,
              dailyRateSnapshot,
              notes: segment.notes,
            },
          });
        }
      }
    });

    revalidateAllocationPaths(input.projectId);
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
}): Promise<ActionResult & { existingAllocationId?: string; overlap?: boolean }> {
  try {
    await requireProjectAccess(input.projectId, true);

    const startDate = parseDateOnlyInput(input.startDate);
    const endDate = parseDateOnlyInput(input.endDate);
    const siblings = await prisma.projectStaffAllocation.findMany({
      where: { projectId: input.projectId, userId: input.userId },
      select: { id: true, startDate: true, endDate: true },
    });

    const overlap = findOverlappingSegment(startDate, endDate, siblings);
    if (overlap) {
      return { existingAllocationId: overlap.id, overlap: true };
    }

    const fd = new FormData();
    fd.set("projectId", input.projectId);
    fd.set("userId", input.userId);
    fd.set("startDate", input.startDate);
    fd.set("endDate", input.endDate);
    fd.set("allocationMode", "AUTO");
    return createProjectAllocation(fd);
  } catch (error) {
    return formatError(error);
  }
}

export async function trimProjectAllocations(): Promise<ActionResult & { fixed?: number }> {
  try {
    await requireRole(["PROJECT_ADMIN", "ADMIN"]);
    const fixed = await trimOverlappingProjectAllocations();
    revalidatePath("/projects/schedule");
    revalidatePath("/projects");
    return { fixed };
  } catch (error) {
    return formatError(error);
  }
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
