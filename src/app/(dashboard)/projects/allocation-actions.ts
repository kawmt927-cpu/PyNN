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
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { allocationDatesOutsideProjectBoundsError } from "@/lib/projects/timeline";
import {
  computeMonthlyCost,
  resolveDailyRateForDate,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";
import { resolveMonthCostFromHistory } from "@/lib/personnel/resolve-month-cost";
import {
  clearActualStartIfNoAllocations,
  ensureActualStartOnFirstAllocation,
} from "@/lib/projects/project-actual-dates";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

async function requireProjectAccess(projectId: string, manage = false) {
  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
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

function assertAllocationWithinProjectDates(
  project: {
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    actualStartAt: Date | null;
    actualEndAt: Date | null;
  },
  startDate: Date,
  endDate: Date
) {
  const error = allocationDatesOutsideProjectBoundsError(startDate, endDate, project);
  if (error) throw new Error(error);
}

async function resolveStaffDailyRate(userId: string, referenceDate: Date): Promise<number> {
  const day = toDateOnly(referenceDate);
  const year = day.getFullYear();
  const month = day.getMonth() + 1;

  const [profile, monthRows] = await Promise.all([
    prisma.personnelProfile.findUnique({
      where: { userId },
      select: {
        enabled: true,
        staffCategory: true,
        dailyRate: true,
      },
    }),
    prisma.personnelMonthlyCostAdjustment.findMany({
      where: {
        userId,
        OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
      },
      select: {
        year: true,
        month: true,
        contributionBase: true,
        baseSalary: true,
        socialSecurityCompany: true,
        housingFundCompany: true,
        adjustmentAmount: true,
        notes: true,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  if (!profile?.enabled || profile.staffCategory !== "IMPLEMENTATION") {
    throw new Error("实施人员无效或未启用");
  }

  const resolved = resolveMonthCostFromHistory(
    monthRows.map((row) => ({
      year: row.year,
      month: row.month,
      contributionBase: row.contributionBase != null ? Number(row.contributionBase) : null,
      baseSalary: row.baseSalary != null ? Number(row.baseSalary) : null,
      socialSecurityCompany:
        row.socialSecurityCompany != null ? Number(row.socialSecurityCompany) : null,
      housingFundCompany:
        row.housingFundCompany != null ? Number(row.housingFundCompany) : null,
      adjustmentAmount: Number(row.adjustmentAmount),
      notes: row.notes ?? "",
    })),
    year,
    month
  );

  const fixed = computeMonthlyCost({
    baseSalary: resolved?.baseSalary ?? null,
    socialSecurityCompany: resolved?.socialSecurityCompany ?? null,
    housingFundCompany: resolved?.housingFundCompany ?? null,
  });
  const effective = resolveEffectiveMonthlyCost(fixed, resolved?.adjustmentAmount ?? 0);
  const rate = resolveDailyRateForDate(effective, day);
  if (rate != null) return rate;
  if (profile.dailyRate != null) return Number(profile.dailyRate);
  throw new Error("该人员未设置月成本");
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
    const from = formatLocalDateInput(toDateOnly(overlap.startDate));
    const to = formatLocalDateInput(toDateOnly(overlap.endDate));
    throw new Error(`该时间段与同项目其他排班分段重叠（${from}~${to}），请调整日期`);
  }
}

export async function createProjectAllocation(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    const { project } = await requireProjectAccess(projectId, true);

    const userId = formData.get("userId")?.toString();
    if (!userId) return { error: "请选择人员" };

    const startDate = parseDateOnlyInput(formData.get("startDate")?.toString());
    const endDate = parseDateOnlyInput(formData.get("endDate")?.toString());
    if (startDate > endDate) throw new Error("结束日期不能早于开始日期");
    assertAllocationWithinProjectDates(project, startDate, endDate);

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
    const dailyRateSnapshot = await resolveStaffDailyRate(userId, startDate);

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

    await ensureActualStartOnFirstAllocation(projectId, startDate);

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
    const { project } = await requireProjectAccess(projectId, true);

    const startDate = parseDateOnlyInput(formData.get("startDate")?.toString());
    const endDate = parseDateOnlyInput(formData.get("endDate")?.toString());
    if (startDate > endDate) throw new Error("结束日期不能早于开始日期");
    assertAllocationWithinProjectDates(project, startDate, endDate);

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
    const { project } = await requireProjectAccess(input.projectId, true);
    if (input.segments.length === 0) throw new Error("至少保留一个排班分段");

    const parsed = input.segments.map((segment) => {
      const startDate = toDateOnly(parseDateOnlyInput(segment.startDate));
      const endDate = toDateOnly(parseDateOnlyInput(segment.endDate));
      if (startDate.getTime() > endDate.getTime()) {
        throw new Error("结束日期不能早于开始日期");
      }
      assertAllocationWithinProjectDates(project, startDate, endDate);
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
          const dailyRateSnapshot = await resolveStaffDailyRate(
            input.userId,
            segment.startDate
          );
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

    const earliestStart = parsed.reduce(
      (min, segment) => (segment.startDate.getTime() < min.getTime() ? segment.startDate : min),
      parsed[0].startDate
    );
    await ensureActualStartOnFirstAllocation(input.projectId, earliestStart);
    await clearActualStartIfNoAllocations(input.projectId);

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
    await clearActualStartIfNoAllocations(projectId);
    revalidateAllocationPaths(projectId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}
