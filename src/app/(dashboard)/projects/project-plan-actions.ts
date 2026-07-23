"use server";

import { revalidatePath } from "next/cache";
import { PhaseStatus, ProjectTaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canManageProject, getProjectForUser } from "@/lib/projects/access";
import { parseOptionalDate } from "@/lib/validations/project";
import { compareDates, toDateOnly } from "@/lib/projects/workdays";
import {
  syncPhaseWeightsAndProgress,
  syncProjectProgress,
} from "@/lib/projects/sync-project-progress";
import { syncStatusFromTasks } from "@/lib/projects/sync-project-status";

function formatError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

async function requireProjectManage(projectId: string) {
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
  if (!canManageProject(session.user.role, session.user.id, project)) {
    throw new Error("无权修改该项目");
  }
  return { session, project };
}

async function assertAssigneeEligible(projectId: string, assigneeId: string | null) {
  if (!assigneeId) return;
  const allocation = await prisma.projectStaffAllocation.findFirst({
    where: { projectId, userId: assigneeId },
    select: { id: true },
  });
  if (!allocation) {
    throw new Error("负责人须为本项目资源排班中已投入的人员");
  }
}

function assertWithinProjectWindow(
  project: { plannedStartAt: Date | null; plannedEndAt: Date | null },
  start: Date,
  end: Date,
  options?: { allowEndAfterProject?: boolean }
) {
  if (!project.plannedStartAt || !project.plannedEndAt) {
    throw new Error("请先设置项目计划起止日期");
  }
  const pStart = toDateOnly(project.plannedStartAt);
  const pEnd = toDateOnly(project.plannedEndAt);
  if (compareDates(start, pStart) < 0) {
    throw new Error("开始时间不能早于项目计划开始");
  }
  if (!options?.allowEndAfterProject && compareDates(end, pEnd) > 0) {
    throw new Error("时间必须落在项目计划起止范围内");
  }
}

const phaseDatesSchema = z.object({
  plannedStartAt: z.string().min(1),
  plannedEndAt: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function updateProjectPhasePlan(input: {
  projectId: string;
  phaseId: string;
  plannedStartAt: string;
  plannedEndAt: string;
  name?: string;
  status?: PhaseStatus;
  sortOrder?: number;
}): Promise<ActionResult & { phaseOutOfSyncWarning?: string }> {
  try {
    const { project } = await requireProjectManage(input.projectId);
    const parsed = phaseDatesSchema.parse(input);
    const start = parseOptionalDate(parsed.plannedStartAt);
    const end = parseOptionalDate(parsed.plannedEndAt);
    if (!start || !end) return { error: "请填写阶段起止日期" };
    if (compareDates(start, end) > 0) return { error: "阶段结束不能早于开始" };
    assertWithinProjectWindow(project, start, end);

    await prisma.projectPhase.update({
      where: { id: input.phaseId },
      data: {
        plannedStartAt: start,
        plannedEndAt: end,
        plannedAt: end,
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.sortOrder != null ? { sortOrder: parsed.sortOrder } : {}),
      },
    });

    await syncPhaseWeightsAndProgress(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

const taskSchema = z.object({
  name: z.string().trim().min(1, "任务名称不能为空"),
  description: z.string().optional(),
  phaseId: z.string().min(1),
  plannedStartAt: z.string().min(1),
  plannedEndAt: z.string().min(1),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).default("NOT_STARTED"),
  assigneeId: z.string().optional(),
  sourceModelTaskId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export type ProjectTaskSaveResult = ActionResult & {
  warning?: string;
  taskId?: string;
};

export async function createProjectTask(input: {
  projectId: string;
  phaseId: string;
  name: string;
  description?: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status?: ProjectTaskStatus;
  assigneeId?: string;
  sourceModelTaskId?: string;
  sortOrder?: number;
  actualCompletedAt?: string | null;
  cancelledNote?: string | null;
}): Promise<ProjectTaskSaveResult> {
  try {
    const { project } = await requireProjectManage(input.projectId);
    const parsed = taskSchema.parse(input);
    const start = parseOptionalDate(parsed.plannedStartAt);
    const end = parseOptionalDate(parsed.plannedEndAt);
    if (!start || !end) return { error: "请填写任务起止日期" };
    if (compareDates(start, end) > 0) return { error: "任务结束不能早于开始" };
    assertWithinProjectWindow(project, start, end, { allowEndAfterProject: true });

    const today = toDateOnly(new Date());
    const fullyPast = compareDates(end, today) < 0 && compareDates(start, today) < 0;
    const actualCompletedAt = input.actualCompletedAt?.trim()
      ? parseOptionalDate(input.actualCompletedAt)
      : null;
    if (input.actualCompletedAt?.trim() && !actualCompletedAt) {
      return { error: "实际完成时间格式不正确" };
    }
    const cancelledNote = input.cancelledNote?.trim() || null;
    if (actualCompletedAt && cancelledNote) {
      return { error: "请选择填写实际完成时间或取消备注，不要同时填写" };
    }
    if (fullyPast && !actualCompletedAt && !cancelledNote) {
      return { error: "计划区间已全部落在过去，请填写实际完成时间或取消备注后再保存" };
    }

    const phase = await prisma.projectPhase.findFirst({
      where: { id: parsed.phaseId, projectId: input.projectId },
    });
    if (!phase) return { error: "阶段不存在" };

    const assigneeId = parsed.assigneeId?.trim() || null;
    await assertAssigneeEligible(input.projectId, assigneeId);

    let warning: string | undefined;
    if (project.plannedEndAt && compareDates(end, toDateOnly(project.plannedEndAt)) > 0) {
      warning = "任务结束晚于项目计划结束，已标记为超期任务";
    }
    if (phase.plannedStartAt && phase.plannedEndAt) {
      if (
        compareDates(start, phase.plannedStartAt) < 0 ||
        compareDates(end, phase.plannedEndAt) > 0
      ) {
        warning = warning
          ? `${warning}；任务时间超出所属阶段计划窗口`
          : "任务时间超出所属阶段计划窗口，已保存";
      }
    }

    const maxSort = await prisma.projectTask.aggregate({
      where: { phaseId: parsed.phaseId },
      _max: { sortOrder: true },
    });

    const created = await prisma.projectTask.create({
      data: {
        projectId: input.projectId,
        phaseId: parsed.phaseId,
        name: parsed.name,
        description: parsed.description?.trim() || null,
        plannedStartAt: start,
        plannedEndAt: end,
        status: parsed.status,
        assigneeId,
        sourceModelTaskId: parsed.sourceModelTaskId || null,
        sortOrder: parsed.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        actualCompletedAt,
        cancelledNote,
      },
    });

    await syncProjectProgress(input.projectId);
    await syncStatusFromTasks(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { taskId: created.id, warning };
  } catch (error) {
    return formatError(error);
  }
}

/** 从模型模板批量添加阶段下的子任务 */
export async function createProjectTasksBatch(input: {
  projectId: string;
  phaseId: string;
  tasks: Array<{
    name: string;
    plannedStartAt: string;
    plannedEndAt: string;
    sourceModelTaskId?: string;
    status?: ProjectTaskStatus;
    assigneeId?: string;
    description?: string;
  }>;
}): Promise<ProjectTaskSaveResult & { count?: number }> {
  try {
    const { project } = await requireProjectManage(input.projectId);
    if (!input.tasks.length) return { error: "请至少选择一个任务" };

    const phase = await prisma.projectPhase.findFirst({
      where: { id: input.phaseId, projectId: input.projectId },
    });
    if (!phase) return { error: "阶段不存在" };

    const maxSort = await prisma.projectTask.aggregate({
      where: { phaseId: input.phaseId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? 0) + 1;
    let warning: string | undefined;

    const rows: Array<{
      projectId: string;
      phaseId: string;
      name: string;
      description: string | null;
      plannedStartAt: Date;
      plannedEndAt: Date;
      status: ProjectTaskStatus;
      assigneeId: string | null;
      sourceModelTaskId: string | null;
      sortOrder: number;
    }> = [];

    for (const item of input.tasks) {
      const parsed = taskSchema.parse({
        ...item,
        phaseId: input.phaseId,
        status: item.status ?? "NOT_STARTED",
      });
      const start = parseOptionalDate(parsed.plannedStartAt);
      const end = parseOptionalDate(parsed.plannedEndAt);
      if (!start || !end) return { error: `任务「${parsed.name}」请填写起止日期` };
      if (compareDates(start, end) > 0) {
        return { error: `任务「${parsed.name}」结束不能早于开始` };
      }
      assertWithinProjectWindow(project, start, end, { allowEndAfterProject: true });

      const assigneeId = parsed.assigneeId?.trim() || null;
      await assertAssigneeEligible(input.projectId, assigneeId);

      if (phase.plannedStartAt && phase.plannedEndAt) {
        if (
          compareDates(start, phase.plannedStartAt) < 0 ||
          compareDates(end, phase.plannedEndAt) > 0
        ) {
          warning = "部分任务时间超出所属阶段计划窗口，已保存";
        }
      }

      rows.push({
        projectId: input.projectId,
        phaseId: input.phaseId,
        name: parsed.name,
        description: parsed.description?.trim() || null,
        plannedStartAt: start,
        plannedEndAt: end,
        status: parsed.status,
        assigneeId,
        sourceModelTaskId: parsed.sourceModelTaskId || null,
        sortOrder: nextSort++,
      });
    }

    await prisma.projectTask.createMany({ data: rows });
    await syncProjectProgress(input.projectId);
    await syncStatusFromTasks(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { count: rows.length, warning };
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectTask(input: {
  projectId: string;
  taskId: string;
  phaseId?: string;
  name?: string;
  description?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  status?: ProjectTaskStatus;
  assigneeId?: string | null;
  sortOrder?: number;
  actualCompletedAt?: string | null;
  cancelledNote?: string | null;
}): Promise<ProjectTaskSaveResult> {
  try {
    const { project } = await requireProjectManage(input.projectId);
    const existing = await prisma.projectTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
      include: { phase: true },
    });
    if (!existing) return { error: "任务不存在" };

    const phaseId = input.phaseId ?? existing.phaseId;
    const name = input.name?.trim() || existing.name;
    const start = input.plannedStartAt
      ? parseOptionalDate(input.plannedStartAt)
      : existing.plannedStartAt;
    const end = input.plannedEndAt
      ? parseOptionalDate(input.plannedEndAt)
      : existing.plannedEndAt;
    if (!start || !end) return { error: "请填写任务起止日期" };
    if (compareDates(start, end) > 0) return { error: "任务结束不能早于开始" };
    assertWithinProjectWindow(project, start, end, { allowEndAfterProject: true });

    const phase = await prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId: input.projectId },
    });
    if (!phase) return { error: "阶段不存在" };

    const assigneeId =
      input.assigneeId === undefined
        ? existing.assigneeId
        : input.assigneeId?.trim() || null;
    await assertAssigneeEligible(input.projectId, assigneeId);

    let warning: string | undefined;
    if (project.plannedEndAt && compareDates(end, toDateOnly(project.plannedEndAt)) > 0) {
      warning = "任务结束晚于项目计划结束，已标记为超期任务";
    }
    if (phase.plannedStartAt && phase.plannedEndAt) {
      if (
        compareDates(start, phase.plannedStartAt) < 0 ||
        compareDates(end, phase.plannedEndAt) > 0
      ) {
        warning = warning
          ? `${warning}；任务时间超出所属阶段计划窗口`
          : "任务时间超出所属阶段计划窗口，已保存";
      }
    }

    const actualCompletedAt =
      input.actualCompletedAt === undefined
        ? undefined
        : input.actualCompletedAt?.trim()
          ? parseOptionalDate(input.actualCompletedAt)
          : null;
    if (input.actualCompletedAt !== undefined && input.actualCompletedAt?.trim() && !actualCompletedAt) {
      return { error: "实际完成时间格式不正确" };
    }

    const cancelledNote =
      input.cancelledNote === undefined
        ? undefined
        : input.cancelledNote?.trim() || null;

    if (actualCompletedAt && cancelledNote) {
      return { error: "请选择填写实际完成时间或取消备注，不要同时填写" };
    }

    const today = toDateOnly(new Date());
    const fullyPast = compareDates(end, today) < 0 && compareDates(start, today) < 0;
    const nextActual =
      actualCompletedAt !== undefined ? actualCompletedAt : existing.actualCompletedAt;
    const nextCancelled =
      cancelledNote !== undefined ? cancelledNote : existing.cancelledNote;
    if (fullyPast && !nextActual && !nextCancelled) {
      return { error: "计划区间已全部落在过去，请填写实际完成时间或取消备注后再保存" };
    }

    await prisma.projectTask.update({
      where: { id: input.taskId },
      data: {
        phaseId,
        name,
        description:
          input.description === undefined
            ? undefined
            : input.description.trim() || null,
        plannedStartAt: start,
        plannedEndAt: end,
        status: input.status ?? existing.status,
        assigneeId,
        ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
        ...(actualCompletedAt !== undefined ? { actualCompletedAt } : {}),
        ...(cancelledNote !== undefined ? { cancelledNote } : {}),
      },
    });

    await syncProjectProgress(input.projectId);
    await syncStatusFromTasks(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { warning };
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteProjectTask(input: {
  projectId: string;
  taskId: string;
}): Promise<ActionResult> {
  try {
    await requireProjectManage(input.projectId);
    await prisma.projectTask.deleteMany({
      where: { id: input.taskId, projectId: input.projectId },
    });
    await syncProjectProgress(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}
