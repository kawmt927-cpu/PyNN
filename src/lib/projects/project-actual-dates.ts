import { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/projects/workdays";

/** 首次分配人力资源时写入实际开始（已有则不覆盖） */
export async function ensureActualStartOnFirstAllocation(
  projectId: string,
  allocationStartDate: Date
) {
  const day = toDateOnly(allocationStartDate);
  await prisma.project.updateMany({
    where: { id: projectId, actualStartAt: null },
    data: { actualStartAt: day },
  });
}

/** 已无任何人力投入时清空实际开始，避免残留计划开始等误填值 */
export async function clearActualStartIfNoAllocations(projectId: string) {
  const count = await prisma.projectStaffAllocation.count({ where: { projectId } });
  if (count > 0) return false;
  const result = await prisma.project.updateMany({
    where: { id: projectId, actualStartAt: { not: null } },
    data: { actualStartAt: null },
  });
  return result.count > 0;
}

/**
 * 状态置为「已关闭」时写入实际结束（以当天为准；已有则不覆盖）。
 * 从「已关闭」改回其他状态时清空实际结束，便于再次关闭时重记。
 */
export async function syncActualEndWithStatus(
  projectId: string,
  nextStatus: ProjectStatus,
  previousStatus: ProjectStatus,
  endedAt: Date = new Date()
) {
  if (nextStatus === "CLOSED" && previousStatus !== "CLOSED") {
    const day = toDateOnly(endedAt);
    await prisma.project.updateMany({
      where: { id: projectId, actualEndAt: null },
      data: { actualEndAt: day },
    });
    return;
  }
  if (previousStatus === "CLOSED" && nextStatus !== "CLOSED") {
    await prisma.project.updateMany({
      where: { id: projectId },
      data: { actualEndAt: null },
    });
  }
}

/** @deprecated 使用 syncActualEndWithStatus */
export async function ensureActualEndOnClosed(
  projectId: string,
  nextStatus: ProjectStatus,
  previousStatus: ProjectStatus,
  endedAt: Date = new Date()
) {
  await syncActualEndWithStatus(projectId, nextStatus, previousStatus, endedAt);
}
