import type { ProjectTaskStatus } from "@prisma/client";

/** 显式进度优先；否则：未开始 0%、完成 100%、其余 50% */
export function resolveTaskProgressPercent(input: {
  status: ProjectTaskStatus;
  progressPercent?: number | null;
  cancelledNote?: string | null;
}): number {
  if (input.cancelledNote?.trim()) return 0;
  if (
    input.progressPercent != null &&
    Number.isFinite(input.progressPercent) &&
    input.progressPercent >= 0 &&
    input.progressPercent <= 100
  ) {
    return Math.round(input.progressPercent);
  }
  if (input.status === "COMPLETED") return 100;
  if (input.status === "NOT_STARTED") return 0;
  return 50;
}

/** 视为「已开工」：用于阶段/项目状态联动 */
export function isProjectTaskStarted(status: ProjectTaskStatus): boolean {
  return (
    status === "IN_PROGRESS" ||
    status === "TESTING" ||
    status === "WAITING" ||
    status === "PAUSED" ||
    status === "COMPLETED"
  );
}
