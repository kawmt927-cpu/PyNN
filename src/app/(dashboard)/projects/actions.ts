"use server";

import { revalidatePath } from "next/cache";
import { PhaseStatus, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  canCreateProject,
  canDeleteProject,
  canManageProject,
  getProjectForUser,
} from "@/lib/projects/access";
import {
  createProjectSchema,
  parseOptionalDate,
  projectOverviewSchema,
  projectPhaseSchema,
} from "@/lib/validations/project";
import { z } from "zod";
import { toDateOnly } from "@/lib/projects/workdays";
import { computeExtendedProjectWindow } from "@/lib/projects/project-window";
import { syncActualEndWithStatus } from "@/lib/projects/project-actual-dates";
import {
  assertProjectStatusTransition,
  evaluateProjectSetup,
} from "@/lib/projects/project-setup-gate";
import { scaleProjectModelPhasesToWindow } from "@/lib/projects/apply-project-model";
import {
  syncPhaseWeightsAndProgress,
  syncProjectProgress,
} from "@/lib/projects/sync-project-progress";

const projectStatusSchema = z.enum([
  "PENDING_START",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
  "CLOSED",
] as const);

const LINKABLE_CONTRACT_STATUSES = [
  "SIGNED_PENDING_IMPL",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
] as const;

function formatError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
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

export async function createProject(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["ADMIN", "PROJECT_ADMIN"]);
    if (!canCreateProject(session.user.role)) {
      return { error: "无权新建项目" };
    }

    const contractIdRaw = formData.get("contractId")?.toString().trim() || "";
    const customerIdRaw = formData.get("customerId")?.toString().trim() || "";
    const parsed = createProjectSchema.parse({
      name: formData.get("name"),
      customerId: customerIdRaw || null,
      contractId: contractIdRaw || null,
      notes: formData.get("notes")?.toString(),
    });

    let customerId: string | undefined;
    if (parsed.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: parsed.customerId },
        select: { id: true },
      });
      if (!customer) return { error: "客户不存在" };
      customerId = customer.id;
    }

    let contractId: string | undefined;
    if (parsed.contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: parsed.contractId },
        select: {
          id: true,
          endUserCustomerId: true,
          status: true,
          project: { select: { id: true } },
        },
      });
      if (!contract) return { error: "合同不存在" };
      if (contract.project) return { error: "该合同已关联项目" };
      if (
        !LINKABLE_CONTRACT_STATUSES.includes(
          contract.status as (typeof LINKABLE_CONTRACT_STATUSES)[number]
        )
      ) {
        return { error: "仅已签署的合同可关联项目" };
      }
      if (customerId && contract.endUserCustomerId !== customerId) {
        return { error: "所选客户须与合同最终用户一致" };
      }
      contractId = contract.id;
      // 关联合同时若未选手动客户，默认带上合同最终用户
      if (!customerId) customerId = contract.endUserCustomerId;
    }

    const project = await prisma.project.create({
      data: {
        name: parsed.name.trim(),
        customerId,
        contractId,
        notes: parsed.notes?.trim() || undefined,
        status: "PENDING_START",
      },
    });

    if (contractId) {
      const { syncContractStatusFromProject } = await import(
        "@/lib/contracts/sync-contract-status-from-project"
      );
      await syncContractStatusFromProject(project.id);
    }

    revalidatePath("/projects");
    revalidatePath("/contracts");
    if (contractId) revalidatePath(`/contracts/${contractId}`);
    return { redirectTo: `/projects/${project.id}` };
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectOverview(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    await requireProjectAccess(projectId, true);

    const parsed = projectOverviewSchema.parse({
      plannedStartAt: formData.get("plannedStartAt")?.toString(),
      plannedEndAt: formData.get("plannedEndAt")?.toString(),
      notes: formData.get("notes")?.toString(),
    });

    const plannedStartAt = parseOptionalDate(parsed.plannedStartAt);
    const plannedEndAt = parseOptionalDate(parsed.plannedEndAt);
    if (plannedStartAt && plannedEndAt && plannedStartAt.getTime() > plannedEndAt.getTime()) {
      throw new Error("计划结束不能早于计划开始");
    }

    // 状态 / 进度 / 实际起止由系统规则维护，概览表单不可改写
    await prisma.project.update({
      where: { id: projectId },
      data: {
        plannedStartAt,
        plannedEndAt,
        notes: parsed.notes?.trim() || null,
      },
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectStatus(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    const { project } = await requireProjectAccess(projectId, true);

    const nextStatus = projectStatusSchema.parse(formData.get("status")?.toString()) as ProjectStatus;
    const phaseCount = await prisma.projectPhase.count({ where: { projectId } });
    const setup = evaluateProjectSetup({
      plannedStartAt: project.plannedStartAt,
      plannedEndAt: project.plannedEndAt,
      phaseCount,
    });
    assertProjectStatusTransition(project.status, nextStatus, setup);

    await prisma.project.update({
      where: { id: projectId },
      data: { status: nextStatus },
    });
    await syncActualEndWithStatus(projectId, nextStatus, project.status);
    const { syncContractStatusFromProject } = await import(
      "@/lib/contracts/sync-contract-status-from-project"
    );
    await syncContractStatusFromProject(projectId);

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    revalidatePath("/contracts");
    if (project.contractId) revalidatePath(`/contracts/${project.contractId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function createProjectPhase(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    const { project } = await requireProjectAccess(projectId, true);
    const extendProjectWindow = formData.get("extendProjectWindow")?.toString() === "1";

    const plannedStartAt =
      parseOptionalDate(formData.get("plannedStartAt")?.toString()) ??
      parseOptionalDate(formData.get("plannedAt")?.toString());
    const plannedEndAt =
      parseOptionalDate(formData.get("plannedEndAt")?.toString()) ?? plannedStartAt;

    const parsed = projectPhaseSchema.parse({
      name: formData.get("name"),
      sortOrder: formData.get("sortOrder"),
      parallelGroup: formData.get("parallelGroup") || undefined,
      status: formData.get("status") ?? "NOT_STARTED",
      plannedAt: formData.get("plannedAt")?.toString(),
      completedAt: formData.get("completedAt")?.toString(),
      sourceProduct: formData.get("sourceProduct")?.toString(),
    });

    if (plannedStartAt && plannedEndAt && plannedStartAt.getTime() > plannedEndAt.getTime()) {
      throw new Error("阶段结束不能早于开始");
    }

    const extended = computeExtendedProjectWindow({
      projectStart: project.plannedStartAt,
      projectEnd: project.plannedEndAt,
      phaseStart: plannedStartAt,
      phaseEnd: plannedEndAt,
    });
    if (extended && !extendProjectWindow) {
      if (
        plannedStartAt &&
        project.plannedStartAt &&
        plannedStartAt < toDateOnly(project.plannedStartAt)
      ) {
        throw new Error("阶段开始不能早于项目计划开始");
      }
      if (plannedEndAt && project.plannedEndAt && plannedEndAt > toDateOnly(project.plannedEndAt)) {
        throw new Error("阶段结束不能晚于项目计划结束");
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      if (extended && extendProjectWindow) {
        await tx.project.update({
          where: { id: projectId },
          data: {
            plannedStartAt: extended.plannedStartAt,
            plannedEndAt: extended.plannedEndAt,
          },
        });
      }
      return tx.projectPhase.create({
        data: {
          projectId,
          name: parsed.name,
          sortOrder: parsed.sortOrder,
          parallelGroup: parsed.parallelGroup ?? null,
          status: parsed.status as PhaseStatus,
          plannedAt: plannedEndAt,
          plannedStartAt,
          plannedEndAt,
          completedAt: parseOptionalDate(parsed.completedAt),
          sourceProduct: parsed.sourceProduct?.trim() || null,
        },
      });
    });

    if (parsed.status === "COMPLETED") {
      const { handleProjectPhaseCompleted } = await import(
        "@/lib/contracts/on-phase-completed"
      );
      await handleProjectPhaseCompleted(created.id);
      revalidatePath("/admin/ops");
      revalidatePath("/contracts");
      revalidatePath("/notifications");
    }

    await syncPhaseWeightsAndProgress(projectId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectPhase(formData: FormData): Promise<ActionResult> {
  try {
    const phaseId = formData.get("phaseId")?.toString();
    const projectId = formData.get("projectId")?.toString();
    if (!phaseId || !projectId) return { error: "缺少参数" };
    const { project } = await requireProjectAccess(projectId, true);

    const plannedStartAt =
      parseOptionalDate(formData.get("plannedStartAt")?.toString()) ??
      parseOptionalDate(formData.get("plannedAt")?.toString());
    const plannedEndAt =
      parseOptionalDate(formData.get("plannedEndAt")?.toString()) ?? plannedStartAt;

    const parsed = projectPhaseSchema.parse({
      name: formData.get("name"),
      sortOrder: formData.get("sortOrder"),
      parallelGroup: formData.get("parallelGroup") || undefined,
      status: formData.get("status"),
      plannedAt: formData.get("plannedAt")?.toString(),
      completedAt: formData.get("completedAt")?.toString(),
      sourceProduct: formData.get("sourceProduct")?.toString(),
    });

    if (plannedStartAt && plannedEndAt && plannedStartAt.getTime() > plannedEndAt.getTime()) {
      throw new Error("阶段结束不能早于开始");
    }

    const extendProjectWindow = formData.get("extendProjectWindow")?.toString() === "1";
    const extended = computeExtendedProjectWindow({
      projectStart: project.plannedStartAt,
      projectEnd: project.plannedEndAt,
      phaseStart: plannedStartAt,
      phaseEnd: plannedEndAt,
    });
    if (extended && !extendProjectWindow) {
      if (
        plannedStartAt &&
        project.plannedStartAt &&
        plannedStartAt < toDateOnly(project.plannedStartAt)
      ) {
        throw new Error("阶段开始不能早于项目计划开始");
      }
      if (plannedEndAt && project.plannedEndAt && plannedEndAt > toDateOnly(project.plannedEndAt)) {
        throw new Error("阶段结束不能晚于项目计划结束");
      }
    }

    await prisma.$transaction(async (tx) => {
      if (extended && extendProjectWindow) {
        await tx.project.update({
          where: { id: projectId },
          data: {
            plannedStartAt: extended.plannedStartAt,
            plannedEndAt: extended.plannedEndAt,
          },
        });
      }
      await tx.projectPhase.update({
        where: { id: phaseId },
        data: {
          name: parsed.name,
          sortOrder: parsed.sortOrder,
          parallelGroup: parsed.parallelGroup ?? null,
          status: parsed.status as PhaseStatus,
          plannedAt: plannedEndAt,
          plannedStartAt,
          plannedEndAt,
          completedAt: parseOptionalDate(parsed.completedAt),
          sourceProduct: parsed.sourceProduct?.trim() || null,
        },
      });
    });

    if (parsed.status === "COMPLETED") {
      const { handleProjectPhaseCompleted } = await import(
        "@/lib/contracts/on-phase-completed"
      );
      await handleProjectPhaseCompleted(phaseId);
      revalidatePath("/admin/ops");
      revalidatePath("/contracts");
      revalidatePath("/notifications");
    }

    await syncPhaseWeightsAndProgress(projectId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteProjectPhase(formData: FormData): Promise<ActionResult> {
  try {
    const phaseId = formData.get("phaseId")?.toString();
    const projectId = formData.get("projectId")?.toString();
    if (!phaseId || !projectId) return { error: "缺少参数" };
    await requireProjectAccess(projectId, true);

    await prisma.projectPhase.delete({ where: { id: phaseId } });
    await syncPhaseWeightsAndProgress(projectId);
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

/** 从项目模型套用阶段：等比例映射到计划起止，整表替换，只套阶段 */
export async function applyProjectModelToProject(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    const modelId = formData.get("modelId")?.toString();
    if (!projectId || !modelId) return { error: "缺少参数" };
    const { project } = await requireProjectAccess(projectId, true);

    if (!project.plannedStartAt || !project.plannedEndAt) {
      return { error: "请先在概览中填写项目计划开始与计划结束日期" };
    }
    if (toDateOnly(project.plannedStartAt).getTime() > toDateOnly(project.plannedEndAt).getTime()) {
      return { error: "项目计划结束不能早于计划开始" };
    }

    const model = await prisma.projectModel.findFirst({
      where: { id: modelId, enabled: true },
      include: { phases: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });
    if (!model) throw new Error("项目模型不存在或未启用");
    if (model.phases.length === 0) throw new Error("该模型尚无阶段，请先在系统配置中编辑");

    const scaled = scaleProjectModelPhasesToWindow({
      modelPhases: model.phases.map((phase) => ({
        key: phase.id,
        id: phase.id,
        name: phase.name,
        sortOrder: phase.sortOrder,
        startRef: phase.startRef,
        startOffset: phase.startOffset,
        endRef: phase.endRef,
        endOffset: phase.endOffset,
        durationDays: phase.durationDays,
      })),
      modelTotalDays: model.totalDurationDays,
      projectStart: project.plannedStartAt,
      projectEnd: project.plannedEndAt,
    });

    await prisma.$transaction(async (tx) => {
      await tx.projectPhase.deleteMany({ where: { projectId } });
      for (const phase of scaled) {
        await tx.projectPhase.create({
          data: {
            projectId,
            name: phase.name,
            sortOrder: phase.sortOrder,
            parallelGroup: null,
            progressWeight: phase.progressWeight,
            status: "NOT_STARTED",
            plannedAt: phase.plannedEndAt,
            plannedStartAt: phase.plannedStartAt,
            plannedEndAt: phase.plannedEndAt,
            sourceProduct: model.name,
            sourceModelPhaseId: phase.sourceModelPhaseId,
          },
        });
      }
      await tx.project.update({
        where: { id: projectId },
        data: { sourceModelId: model.id, progressPercent: 0 },
      });
    });

    await syncProjectProgress(projectId);
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

/** 删除项目：仅管理员 / 项目管理员；级联清理子数据，解绑合同回款阶段与报销关联 */
export async function deleteProject(projectId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["ADMIN", "PROJECT_ADMIN"]);
    if (!canDeleteProject(session.user.role)) {
      return { error: "无权删除项目" };
    }

    const id = projectId.trim();
    if (!id) return { error: "项目 ID 无效" };

    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) return { error: "项目不存在或已删除" };

    await prisma.$transaction(async (tx) => {
      // 合同分期绑定的项目阶段：解绑，避免删阶段时外键阻塞
      await tx.paymentInstallment.updateMany({
        where: { phase: { projectId: id } },
        data: { phaseId: null },
      });

      // 报销发票：解绑项目与已入账项目成本
      const costIds = (
        await tx.projectCost.findMany({
          where: { projectId: id },
          select: { id: true },
        })
      ).map((c) => c.id);
      if (costIds.length > 0) {
        await tx.expenseInvoice.updateMany({
          where: { postedProjectCostId: { in: costIds } },
          data: { postedProjectCostId: null },
        });
      }
      await tx.expenseInvoice.updateMany({
        where: { projectId: id },
        data: { projectId: null },
      });

      // 阶段外键（无 Cascade）先清空，再删项目（子表 Cascade）
      await tx.projectStaffAllocation.updateMany({
        where: { projectId: id },
        data: { phaseId: null },
      });
      await tx.task.updateMany({
        where: { projectId: id },
        data: { phaseId: null },
      });

      await tx.project.delete({ where: { id } });
    });

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { redirectTo: "/projects" };
  } catch (error) {
    return formatError(error);
  }
}
