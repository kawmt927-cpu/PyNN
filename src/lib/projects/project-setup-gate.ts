import { ProjectStatus } from "@prisma/client";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";

export type ProjectSetupSnapshot = {
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  phaseCount: number;
};

export type ProjectSetupCheck = {
  complete: boolean;
  missing: string[];
  hasPlannedStart: boolean;
  hasPlannedEnd: boolean;
  phaseCount: number;
};

const ALL_STATUSES: ProjectStatus[] = [
  "PENDING_START",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
  "CLOSED",
];

/** 待启动 → 其他状态前须完成的基础设置 */
export function evaluateProjectSetup(project: ProjectSetupSnapshot): ProjectSetupCheck {
  const missing: string[] = [];
  const hasPlannedStart = project.plannedStartAt != null;
  const hasPlannedEnd = project.plannedEndAt != null;

  if (!hasPlannedStart) missing.push("计划开始");
  if (!hasPlannedEnd) missing.push("计划结束");
  if (
    hasPlannedStart &&
    hasPlannedEnd &&
    project.plannedStartAt!.getTime() > project.plannedEndAt!.getTime()
  ) {
    missing.push("计划结束须不早于计划开始");
  }
  if (project.phaseCount < 1) missing.push("至少一个项目阶段");

  return {
    complete: missing.length === 0,
    missing,
    hasPlannedStart,
    hasPlannedEnd,
    phaseCount: project.phaseCount,
  };
}

/** 可调整为任意其他状态（含回退）；仅「待启动」离开时受基础设置门禁 */
export function getAllowedNextStatuses(
  current: ProjectStatus,
  setupComplete: boolean
): ProjectStatus[] {
  if (current === "PENDING_START" && !setupComplete) return [];
  return ALL_STATUSES.filter((status) => status !== current);
}

export function assertProjectStatusTransition(
  current: ProjectStatus,
  next: ProjectStatus,
  setup: ProjectSetupCheck
): void {
  if (current === next) {
    throw new Error("状态未变更");
  }
  const allowed = getAllowedNextStatuses(current, setup.complete);
  if (!allowed.includes(next)) {
    if (current === "PENDING_START" && !setup.complete) {
      throw new Error(`请先完成基础设置：${setup.missing.join("、")}`);
    }
    throw new Error(
      `不允许从「${PROJECT_STATUS_LABELS[current]}」变更为「${PROJECT_STATUS_LABELS[next]}」`
    );
  }
}
