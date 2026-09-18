"use server";

import { revalidatePath } from "next/cache";
import { PhaseStatus, ProjectTaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canEditProjectContent, getProjectForUser, getProjectMemberAccessLevel } from "@/lib/projects/access";
import { parseOptionalDate } from "@/lib/validations/project";
import { compareDates, toDateOnly } from "@/lib/projects/workdays";
import { computeExtendedProjectWindow } from "@/lib/projects/project-window";
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

async function requireProjectEdit(projectId: string) {
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
  const accessLevel = await getProjectMemberAccessLevel(projectId, session.user.id);
  if (!canEditProjectContent(session.user.role, session.user.id, project, accessLevel)) {
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
  /** 超出项目计划时，确认后延长项目计划窗口 */
  extendProjectWindow?: boolean;
}): Promise<ActionResult & { phaseOutOfSyncWarning?: string }> {
  try {
    const { project } = await requireProjectEdit(input.projectId);
    const parsed = phaseDatesSchema.parse(input);
    const start = parseOptionalDate(parsed.plannedStartAt);
    const end = parseOptionalDate(parsed.plannedEndAt);
    if (!start || !end) return { error: "请填写阶段起止日期" };
    if (compareDates(start, end) > 0) return { error: "阶段结束不能早于开始" };

    const extended = computeExtendedProjectWindow({
      projectStart: project.plannedStartAt,
      projectEnd: project.plannedEndAt,
      phaseStart: start,
      phaseEnd: end,
    });
    if (extended && !input.extendProjectWindow) {
      assertWithinProjectWindow(project, start, end);
    }

    await prisma.$transaction(async (tx) => {
      if (extended && input.extendProjectWindow) {
        await tx.project.update({
          where: { id: input.projectId },
          data: {
            plannedStartAt: extended.plannedStartAt,
            plannedEndAt: extended.plannedEndAt,
          },
        });
      }
      await tx.projectPhase.update({
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
    });

    if (parsed.status === "COMPLETED") {
      const { handleProjectPhaseCompleted } = await import(
        "@/lib/contracts/on-phase-completed"
      );
      await handleProjectPhaseCompleted(input.phaseId);
      revalidatePath("/admin/ops");
      revalidatePath("/contracts");
      revalidatePath("/notifications");
      revalidatePath("/today-work");
    }

    await syncPhaseWeightsAndProgress(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/projects");
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
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "TESTING", "WAITING", "PAUSED", "COMPLETED"])
    .default("NOT_STARTED"),
  assigneeId: z.string().optional(),
  sourceModelTaskId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
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
    const { project } = await requireProjectEdit(input.projectId);
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
    const { project } = await requireProjectEdit(input.projectId);
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
  progressPercent?: number | null;
  actualCompletedAt?: string | null;
  cancelledNote?: string | null;
}): Promise<ProjectTaskSaveResult> {
  try {
    const { project } = await requireProjectEdit(input.projectId);
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

    const progressPercent =
      input.progressPercent === undefined
        ? undefined
        : input.progressPercent == null
          ? null
          : Math.min(100, Math.max(0, Math.round(input.progressPercent)));

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
        ...(progressPercent !== undefined ? { progressPercent } : {}),
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

export async function batchUpdateProjectTasks(input: {
  projectId: string;
  taskIds: string[];
  status?: ProjectTaskStatus;
  assigneeId?: string | null;
  plannedStartAt?: string;
  plannedEndAt?: string;
  progressPercent?: number | null;
}): Promise<ActionResult & { count?: number; warning?: string }> {
  try {
    const { project } = await requireProjectEdit(input.projectId);
    const taskIds = [...new Set(input.taskIds.filter(Boolean))];
    if (taskIds.length === 0) return { error: "请选择任务" };

    const tasks = await prisma.projectTask.findMany({
      where: { projectId: input.projectId, id: { in: taskIds } },
      include: { phase: true },
    });
    if (tasks.length !== taskIds.length) return { error: "部分任务不存在" };

    const assigneeId =
      input.assigneeId === undefined
        ? undefined
        : input.assigneeId?.trim() || null;
    if (assigneeId !== undefined) {
      await assertAssigneeEligible(input.projectId, assigneeId);
    }

    const patchStart = input.plannedStartAt
      ? parseOptionalDate(input.plannedStartAt)
      : undefined;
    const patchEnd = input.plannedEndAt
      ? parseOptionalDate(input.plannedEndAt)
      : undefined;
    if (input.plannedStartAt && !patchStart) return { error: "计划开始日期无效" };
    if (input.plannedEndAt && !patchEnd) return { error: "计划结束日期无效" };

    let warning: string | undefined;
    for (const task of tasks) {
      const start = patchStart ?? toDateOnly(task.plannedStartAt);
      const end = patchEnd ?? toDateOnly(task.plannedEndAt);
      if (compareDates(start, end) > 0) {
        return { error: `任务「${task.name}」结束不能早于开始` };
      }
      assertWithinProjectWindow(project, start, end, { allowEndAfterProject: true });
      if (project.plannedEndAt && compareDates(end, toDateOnly(project.plannedEndAt)) > 0) {
        warning = "部分任务结束晚于项目计划结束，已标记为超期任务";
      }
    }

    const progressPercent =
      input.progressPercent === undefined
        ? undefined
        : input.progressPercent == null
          ? null
          : Math.min(100, Math.max(0, Math.round(input.progressPercent)));

    await prisma.$transaction(
      tasks.map((task) =>
        prisma.projectTask.update({
          where: { id: task.id },
          data: {
            ...(input.status ? { status: input.status } : {}),
            ...(assigneeId !== undefined ? { assigneeId } : {}),
            ...(patchStart ? { plannedStartAt: patchStart } : {}),
            ...(patchEnd ? { plannedEndAt: patchEnd } : {}),
            ...(progressPercent !== undefined ? { progressPercent } : {}),
          },
        })
      )
    );

    await syncProjectProgress(input.projectId);
    await syncStatusFromTasks(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { count: tasks.length, warning };
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteProjectTask(input: {
  projectId: string;
  taskId: string;
}): Promise<ActionResult> {
  try {
    await requireProjectEdit(input.projectId);
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

export async function batchDeleteProjectTasks(input: {
  projectId: string;
  taskIds: string[];
}): Promise<ActionResult & { count?: number }> {
  try {
    await requireProjectEdit(input.projectId);
    const taskIds = [...new Set(input.taskIds.filter(Boolean))];
    if (taskIds.length === 0) return { error: "请选择任务" };
    const result = await prisma.projectTask.deleteMany({
      where: { projectId: input.projectId, id: { in: taskIds } },
    });
    await syncProjectProgress(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { count: result.count };
  } catch (error) {
    return formatError(error);
  }
}

const importRowSchema = z.object({
  phaseName: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  plannedStartAt: z.string().min(1),
  plannedEndAt: z.string().min(1),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "TESTING", "WAITING", "PAUSED", "COMPLETED"])
    .optional(),
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
});

/** 按 Excel 整体覆盖本项目阶段与任务（删除旧阶段/任务后重建） */
export async function importProjectTasks(input: {
  projectId: string;
  rows: Array<{
    phaseName: string;
    name: string;
    description?: string;
    plannedStartAt: string;
    plannedEndAt: string;
    status?: ProjectTaskStatus;
    progressPercent?: number | null;
  }>;
}): Promise<ActionResult & { count?: number; warning?: string }> {
  try {
    const { project } = await requireProjectEdit(input.projectId);
    if (!input.rows.length) return { error: "没有可导入的行" };

    const parsedRows: Array<{
      phaseName: string;
      name: string;
      description: string | null;
      plannedStartAt: Date;
      plannedEndAt: Date;
      status: ProjectTaskStatus;
      progressPercent: number | null;
    }> = [];
    let warning: string | undefined;

    for (let i = 0; i < input.rows.length; i++) {
      const parsed = importRowSchema.parse(input.rows[i]);
      const start = parseOptionalDate(parsed.plannedStartAt);
      const end = parseOptionalDate(parsed.plannedEndAt);
      if (!start || !end) {
        return { error: `第 ${i + 1} 行：请填写有效起止日期` };
      }
      if (compareDates(start, end) > 0) {
        return { error: `第 ${i + 1} 行：结束不能早于开始` };
      }
      assertWithinProjectWindow(project, start, end, { allowEndAfterProject: true });
      if (project.plannedEndAt && compareDates(end, toDateOnly(project.plannedEndAt)) > 0) {
        warning = "部分任务结束晚于项目计划结束，已保存";
      }
      parsedRows.push({
        phaseName: parsed.phaseName.trim(),
        name: parsed.name.trim(),
        description: parsed.description?.trim() || null,
        plannedStartAt: start,
        plannedEndAt: end,
        status: parsed.status ?? "NOT_STARTED",
        progressPercent:
          parsed.progressPercent === undefined ? null : parsed.progressPercent,
      });
    }

    const phaseNamesInOrder: string[] = [];
    const phaseSeen = new Set<string>();
    for (const row of parsedRows) {
      if (phaseSeen.has(row.phaseName)) continue;
      phaseSeen.add(row.phaseName);
      phaseNamesInOrder.push(row.phaseName);
    }

    const phaseDateSpan = new Map<
      string,
      { start: Date; end: Date; taskCount: number }
    >();
    for (const row of parsedRows) {
      const cur = phaseDateSpan.get(row.phaseName);
      if (!cur) {
        phaseDateSpan.set(row.phaseName, {
          start: row.plannedStartAt,
          end: row.plannedEndAt,
          taskCount: 1,
        });
        continue;
      }
      if (compareDates(row.plannedStartAt, cur.start) < 0) cur.start = row.plannedStartAt;
      if (compareDates(row.plannedEndAt, cur.end) > 0) cur.end = row.plannedEndAt;
      cur.taskCount += 1;
    }

    await prisma.$transaction(async (tx) => {
      // 解绑分期/排班/旧 Task 上的阶段引用，避免删阶段时外键阻塞
      await tx.paymentInstallment.updateMany({
        where: { phase: { projectId: input.projectId } },
        data: { phaseId: null },
      });
      await tx.projectStaffAllocation.updateMany({
        where: { projectId: input.projectId, phaseId: { not: null } },
        data: { phaseId: null },
      });
      await tx.task.updateMany({
        where: { projectId: input.projectId, phaseId: { not: null } },
        data: { phaseId: null },
      });

      // 先删任务再删阶段（备忘关联随任务级联）
      await tx.projectTask.deleteMany({ where: { projectId: input.projectId } });
      await tx.projectPhase.deleteMany({ where: { projectId: input.projectId } });

      const phaseIdByName = new Map<string, string>();
      for (let i = 0; i < phaseNamesInOrder.length; i++) {
        const phaseName = phaseNamesInOrder[i];
        const span = phaseDateSpan.get(phaseName)!;
        const created = await tx.projectPhase.create({
          data: {
            projectId: input.projectId,
            name: phaseName,
            sortOrder: i,
            status: "NOT_STARTED",
            plannedStartAt: span.start,
            plannedEndAt: span.end,
            plannedAt: span.end,
          },
          select: { id: true },
        });
        phaseIdByName.set(phaseName, created.id);
      }

      const sortByPhase = new Map<string, number>();
      for (const row of parsedRows) {
        const phaseId = phaseIdByName.get(row.phaseName);
        if (!phaseId) throw new Error(`阶段「${row.phaseName}」创建失败`);
        const nextSort = (sortByPhase.get(phaseId) ?? 0) + 1;
        sortByPhase.set(phaseId, nextSort);
        await tx.projectTask.create({
          data: {
            projectId: input.projectId,
            phaseId,
            name: row.name,
            description: row.description,
            plannedStartAt: row.plannedStartAt,
            plannedEndAt: row.plannedEndAt,
            status: row.status,
            progressPercent: row.progressPercent,
            sortOrder: nextSort,
          },
        });
      }
    });

    await syncProjectProgress(input.projectId);
    await syncStatusFromTasks(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { count: parsedRows.length, warning };
  } catch (error) {
    return formatError(error);
  }
}

/** 删除本项目下没有任何任务的空阶段（甘特图残留空行清理） */
export async function deleteEmptyProjectPhases(input: {
  projectId: string;
}): Promise<ActionResult & { count?: number; warning?: string }> {
  try {
    await requireProjectEdit(input.projectId);

    const emptyPhases = await prisma.projectPhase.findMany({
      where: { projectId: input.projectId, projectTasks: { none: {} } },
      select: { id: true },
    });
    if (emptyPhases.length === 0) {
      return { count: 0, warning: "没有可清理的空阶段" };
    }

    const ids = emptyPhases.map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      await tx.paymentInstallment.updateMany({
        where: { phaseId: { in: ids } },
        data: { phaseId: null },
      });
      await tx.projectStaffAllocation.updateMany({
        where: { phaseId: { in: ids } },
        data: { phaseId: null },
      });
      await tx.task.updateMany({
        where: { phaseId: { in: ids } },
        data: { phaseId: null },
      });
      await tx.projectPhase.deleteMany({ where: { id: { in: ids } } });
    });

    await syncProjectProgress(input.projectId);
    revalidatePath(`/projects/${input.projectId}`);
    return { count: ids.length };
  } catch (error) {
    return formatError(error);
  }
}
