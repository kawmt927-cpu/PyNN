"use server";

import { revalidatePath } from "next/cache";
import { PhaseStatus, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canManageProject, getProjectForUser } from "@/lib/projects/access";
import {
  parseOptionalDate,
  projectOverviewSchema,
  projectPhaseSchema,
} from "@/lib/validations/project";

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

export async function updateProjectOverview(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    await requireProjectAccess(projectId, true);

    const parsed = projectOverviewSchema.parse({
      status: formData.get("status"),
      progressPercent: formData.get("progressPercent"),
      plannedStartAt: formData.get("plannedStartAt")?.toString(),
      plannedEndAt: formData.get("plannedEndAt")?.toString(),
      actualStartAt: formData.get("actualStartAt")?.toString(),
      actualEndAt: formData.get("actualEndAt")?.toString(),
      notes: formData.get("notes")?.toString(),
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: parsed.status as ProjectStatus,
        progressPercent: parsed.progressPercent,
        plannedStartAt: parseOptionalDate(parsed.plannedStartAt),
        plannedEndAt: parseOptionalDate(parsed.plannedEndAt),
        actualStartAt: parseOptionalDate(parsed.actualStartAt),
        actualEndAt: parseOptionalDate(parsed.actualEndAt),
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

export async function createProjectPhase(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = formData.get("projectId")?.toString();
    if (!projectId) return { error: "缺少项目 ID" };
    await requireProjectAccess(projectId, true);

    const parsed = projectPhaseSchema.parse({
      name: formData.get("name"),
      sortOrder: formData.get("sortOrder"),
      parallelGroup: formData.get("parallelGroup") || undefined,
      status: formData.get("status") ?? "NOT_STARTED",
      plannedAt: formData.get("plannedAt")?.toString(),
      completedAt: formData.get("completedAt")?.toString(),
      sourceProduct: formData.get("sourceProduct")?.toString(),
    });

    await prisma.projectPhase.create({
      data: {
        projectId,
        name: parsed.name,
        sortOrder: parsed.sortOrder,
        parallelGroup: parsed.parallelGroup ?? null,
        status: parsed.status as PhaseStatus,
        plannedAt: parseOptionalDate(parsed.plannedAt),
        completedAt: parseOptionalDate(parsed.completedAt),
        sourceProduct: parsed.sourceProduct?.trim() || null,
      },
    });

    revalidatePath(`/projects/${projectId}`);
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
    await requireProjectAccess(projectId, true);

    const parsed = projectPhaseSchema.parse({
      name: formData.get("name"),
      sortOrder: formData.get("sortOrder"),
      parallelGroup: formData.get("parallelGroup") || undefined,
      status: formData.get("status"),
      plannedAt: formData.get("plannedAt")?.toString(),
      completedAt: formData.get("completedAt")?.toString(),
      sourceProduct: formData.get("sourceProduct")?.toString(),
    });

    await prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        name: parsed.name,
        sortOrder: parsed.sortOrder,
        parallelGroup: parsed.parallelGroup ?? null,
        status: parsed.status as PhaseStatus,
        plannedAt: parseOptionalDate(parsed.plannedAt),
        completedAt: parseOptionalDate(parsed.completedAt),
        sourceProduct: parsed.sourceProduct?.trim() || null,
      },
    });

    revalidatePath(`/projects/${projectId}`);
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
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}
