"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canEditProjectContent, getProjectForUser, getProjectMemberAccessLevel } from "@/lib/projects/access";

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

const memoCategorySchema = z.enum(["FEEDBACK", "MEETING", "OTHER"]);

const createMemoSchema = z.object({
  projectId: z.string().min(1),
  content: z.string().trim().min(1, "请填写备忘内容"),
  category: memoCategorySchema.default("OTHER"),
  isRisk: z.boolean().default(false),
  followStatus: z.enum(["OPEN", "DONE"]).default("OPEN"),
  taskIds: z.array(z.string()).optional(),
});

const updateMemoSchema = z.object({
  projectId: z.string().min(1),
  memoId: z.string().min(1),
  content: z.string().trim().min(1, "请填写备忘内容").optional(),
  category: memoCategorySchema.optional(),
  isRisk: z.boolean().optional(),
  followStatus: z.enum(["OPEN", "DONE"]).optional(),
});

export async function createProjectMemo(input: {
  projectId: string;
  content: string;
  category?: string;
  isRisk?: boolean;
  followStatus?: string;
  taskIds?: string[];
}): Promise<ActionResult & { memoId?: string }> {
  try {
    const { session } = await requireProjectEdit(input.projectId);
    const parsed = createMemoSchema.parse({
      ...input,
      category: input.category ?? "OTHER",
      isRisk: input.isRisk ?? false,
      followStatus: input.followStatus ?? "OPEN",
    });
    const taskIds = [...new Set((parsed.taskIds ?? []).filter(Boolean))];
    if (taskIds.length > 0) {
      const count = await prisma.projectTask.count({
        where: { projectId: parsed.projectId, id: { in: taskIds } },
      });
      if (count !== taskIds.length) {
        return { error: "关联任务无效或不属于本项目" };
      }
    }

    const memo = await prisma.projectMemo.create({
      data: {
        projectId: parsed.projectId,
        content: parsed.content,
        category: parsed.category,
        isRisk: parsed.isRisk,
        followStatus: parsed.followStatus,
        authorId: session.user.id,
        ...(taskIds.length > 0
          ? {
              taskLinks: {
                create: taskIds.map((taskId) => ({ taskId })),
              },
            }
          : {}),
      },
      select: { id: true },
    });

    revalidatePath(`/projects/${parsed.projectId}`);
    return { memoId: memo.id };
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectMemo(input: {
  projectId: string;
  memoId: string;
  content?: string;
  category?: string;
  isRisk?: boolean;
  followStatus?: "OPEN" | "DONE";
}): Promise<ActionResult> {
  try {
    await requireProjectEdit(input.projectId);
    const parsed = updateMemoSchema.parse(input);
    const data: {
      content?: string;
      category?: string;
      isRisk?: boolean;
      followStatus?: string;
    } = {};
    if (parsed.content !== undefined) data.content = parsed.content;
    if (parsed.category !== undefined) data.category = parsed.category;
    if (parsed.isRisk !== undefined) data.isRisk = parsed.isRisk;
    if (parsed.followStatus !== undefined) data.followStatus = parsed.followStatus;
    if (Object.keys(data).length === 0) return { error: "没有可更新的字段" };

    const updated = await prisma.projectMemo.updateMany({
      where: { id: parsed.memoId, projectId: parsed.projectId },
      data,
    });
    if (updated.count === 0) return { error: "备忘不存在" };
    revalidatePath(`/projects/${parsed.projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectMemoFollowStatus(input: {
  projectId: string;
  memoId: string;
  followStatus: "OPEN" | "DONE";
}): Promise<ActionResult> {
  return updateProjectMemo(input);
}

export async function deleteProjectMemo(input: {
  projectId: string;
  memoId: string;
}): Promise<ActionResult> {
  try {
    await requireProjectEdit(input.projectId);
    await prisma.projectMemo.deleteMany({
      where: { id: input.memoId, projectId: input.projectId },
    });
    revalidatePath(`/projects/${input.projectId}`);
    return {};
  } catch (error) {
    return formatError(error);
  }
}
