"use server";

import { revalidatePath } from "next/cache";
import { ProjectTaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  syncProjectProgress,
} from "@/lib/projects/sync-project-progress";
import { syncStatusFromTasks } from "@/lib/projects/sync-project-status";
import { resolveTaskProgressPercent } from "@/lib/projects/task-progress";

function formatError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

const statusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "TESTING",
  "WAITING",
  "PAUSED",
  "COMPLETED",
]);

/** 任务负责人更新自己的工作状态（不要求项目管理权限） */
export async function updateMyAssignedProjectTaskStatus(input: {
  taskId: string;
  status: ProjectTaskStatus;
}): Promise<ActionResult> {
  try {
    const session = await requireRole([
      "PROJECT_ADMIN",
      "PROJECT_MANAGER",
      "PROJECT_STAFF",
      "ADMIN",
    ]);
    const status = statusSchema.parse(input.status);
    const task = await prisma.projectTask.findUnique({
      where: { id: input.taskId },
      select: {
        id: true,
        projectId: true,
        phaseId: true,
        assigneeId: true,
        progressPercent: true,
        cancelledNote: true,
      },
    });
    if (!task) return { error: "任务不存在" };
    if (task.assigneeId !== session.user.id) {
      return { error: "只能更新指派给自己的任务" };
    }

    // 负责人改状态：按新状态重算进度，不沿用旧的显式 progressPercent
    const progressPercent = resolveTaskProgressPercent({
      status,
      progressPercent: null,
      cancelledNote: task.cancelledNote,
    });

    await prisma.projectTask.update({
      where: { id: task.id },
      data: {
        status,
        progressPercent,
        ...(status === "COMPLETED" && !task.cancelledNote
          ? { actualCompletedAt: new Date() }
          : status !== "COMPLETED"
            ? { actualCompletedAt: null }
            : {}),
      },
    });

    await syncProjectProgress(task.projectId);
    await syncStatusFromTasks(task.projectId);
    revalidatePath("/my-tasks");
    revalidatePath("/plans-tasks");
    revalidatePath(`/projects/${task.projectId}`);
    revalidatePath("/projects");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
