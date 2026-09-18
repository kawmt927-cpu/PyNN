"use server";

import { revalidatePath } from "next/cache";
import { ProjectMemberAccess, type PersonnelType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canManageProject, getProjectForUser } from "@/lib/projects/access";

function formatError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

const accessSchema = z.enum(["NONE", "VIEW", "EDIT"]);

const updateSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  accessLevel: accessSchema,
});

/** 项目经理设置成员打开项目页权限 */
export async function updateProjectMemberAccess(input: {
  projectId: string;
  userId: string;
  accessLevel: ProjectMemberAccess;
}): Promise<ActionResult> {
  try {
    const parsed = updateSchema.parse(input);
    const session = await requireRole([
      "PROJECT_ADMIN",
      "PROJECT_MANAGER",
      "ADMIN",
    ]);
    const project = await getProjectForUser(
      parsed.projectId,
      session.user.role,
      session.user.id
    );
    if (!project) return { error: "项目不存在或无权访问" };
    if (!canManageProject(session.user.role, session.user.id, project)) {
      return { error: "仅项目经理可设置访问权限" };
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.userId },
      select: {
        id: true,
        role: true,
        personnelProfile: { select: { personnelType: true } },
      },
    });
    if (!user) return { error: "用户不存在" };
    if (user.role !== "PROJECT_MANAGER" && user.role !== "PROJECT_STAFF") {
      return { error: "仅可为项目经理/项目人员设置访问权限" };
    }

    const memberRole: PersonnelType =
      user.personnelProfile?.personnelType ??
      (user.role === "PROJECT_MANAGER" ? "PROJECT_MANAGER" : "IMPLEMENTER");

    await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: parsed.projectId,
          userId: parsed.userId,
        },
      },
      create: {
        projectId: parsed.projectId,
        userId: parsed.userId,
        memberRole,
        isProjectManager: false,
        accessLevel: parsed.accessLevel,
      },
      update: {
        accessLevel: parsed.accessLevel,
      },
    });

    revalidatePath(`/projects/${parsed.projectId}`);
    revalidatePath("/plans-tasks");
    revalidatePath("/my-tasks");
    revalidatePath("/projects");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
