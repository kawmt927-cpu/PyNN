"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncContractStatusFromProject } from "@/lib/contracts/sync-contract-status-from-project";
import {
  canEditProjectContent,
  canManageProject,
  getProjectMemberAccessLevel,
} from "@/lib/projects/access";

async function loadProjectForActor(projectId: string) {
  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
  ]);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      projectManagerId: true,
    },
  });
  if (!project) throw new Error("项目不存在");
  return { session, project };
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

/** 登记验收；PASSED 时项目状态 → ACCEPTED 并联动合同 */
export async function createProjectAcceptance(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const resultRaw = String(formData.get("result") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const acceptedAtRaw = String(formData.get("acceptedAt") ?? "").trim();

  if (!projectId) throw new Error("参数不完整");
  if (resultRaw !== "PASSED" && resultRaw !== "FAILED") {
    throw new Error("请选择验收结论");
  }

  const acceptedAt = (() => {
    if (!acceptedAtRaw) return new Date();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(acceptedAtRaw);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(acceptedAtRaw);
    if (Number.isNaN(d.getTime())) throw new Error("验收日期无效");
    return d;
  })();

  const { session, project } = await loadProjectForActor(projectId);
  const memberAccess = await getProjectMemberAccessLevel(projectId, session.user.id);
  const canEdit = canEditProjectContent(
    session.user.role,
    session.user.id,
    project,
    memberAccess
  );
  if (!canEdit && session.user.role !== "ADMIN" && session.user.role !== "PROJECT_ADMIN") {
    throw new Error("无权登记验收");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectAcceptance.create({
      data: {
        projectId,
        acceptedAt,
        result: resultRaw,
        notes,
        createdById: session.user.id,
      },
    });

    if (resultRaw === "PASSED" && project.status !== "ACCEPTED") {
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: "ACCEPTED",
          actualEndAt: acceptedAt,
        },
      });
    }
  });

  if (resultRaw === "PASSED") {
    await syncContractStatusFromProject(projectId);
  }

  revalidateProject(projectId);
}

export async function createProjectChangeRequest(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const impact = String(formData.get("impact") ?? "").trim() || null;
  const submitNow = formData.get("submitNow") === "on" || formData.get("submitNow") === "true";

  if (!projectId || !title) throw new Error("请填写变更标题");

  const { session, project } = await loadProjectForActor(projectId);
  const memberAccess = await getProjectMemberAccessLevel(projectId, session.user.id);
  const canEdit = canEditProjectContent(
    session.user.role,
    session.user.id,
    project,
    memberAccess
  );
  if (!canEdit && session.user.role !== "ADMIN" && session.user.role !== "PROJECT_ADMIN") {
    throw new Error("无权创建变更单");
  }

  await prisma.projectChangeRequest.create({
    data: {
      projectId,
      title,
      description,
      impact,
      status: submitNow ? "SUBMITTED" : "DRAFT",
      requesterId: session.user.id,
    },
  });

  revalidateProject(projectId);
}

export async function submitProjectChangeRequest(formData: FormData) {
  const id = String(formData.get("changeRequestId") ?? "").trim();
  if (!id) throw new Error("参数不完整");

  const row = await prisma.projectChangeRequest.findUnique({ where: { id } });
  if (!row || row.status !== "DRAFT") throw new Error("仅草稿可提交");

  const { session, project } = await loadProjectForActor(row.projectId);
  if (
    row.requesterId !== session.user.id &&
    !canManageProject(session.user.role, session.user.id, project)
  ) {
    throw new Error("无权提交该变更单");
  }

  await prisma.projectChangeRequest.update({
    where: { id },
    data: { status: "SUBMITTED" },
  });

  revalidateProject(row.projectId);
}

export async function reviewProjectChangeRequest(formData: FormData) {
  const session = await requireRole(["PROJECT_ADMIN", "PROJECT_MANAGER", "ADMIN"]);
  const id = String(formData.get("changeRequestId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!id) throw new Error("参数不完整");
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new Error("无效审批结论");
  }

  const row = await prisma.projectChangeRequest.findUnique({ where: { id } });
  if (!row || row.status !== "SUBMITTED") throw new Error("变更单不存在或不可审批");

  if (session.user.role === "PROJECT_MANAGER") {
    const project = await prisma.project.findUnique({
      where: { id: row.projectId },
      select: { projectManagerId: true },
    });
    if (project?.projectManagerId !== session.user.id) {
      throw new Error("仅本项目经理或项目管理员可审批");
    }
  }

  await prisma.projectChangeRequest.update({
    where: { id },
    data: {
      status: decision,
      reviewerId: session.user.id,
    },
  });

  revalidateProject(row.projectId);
}
