import type { PhaseStatus, ProjectTaskStatus } from "@prisma/client";

export type ProgressPhaseInput = {
  id: string;
  status: PhaseStatus;
  progressWeight: number;
  tasks: Array<{ status: ProjectTaskStatus }>;
};

/** 单阶段完成度 0–1 */
export function phaseCompletionRatio(phase: ProgressPhaseInput): number {
  if (phase.status === "COMPLETED") return 1;
  if (phase.status === "NOT_STARTED" || phase.status === "BLOCKED") return 0;

  // IN_PROGRESS
  if (phase.tasks.length === 0) return 0.5;
  const done = phase.tasks.filter((t) => t.status === "COMPLETED").length;
  return done / phase.tasks.length;
}

/** 项目进度百分比 0–100 */
export function computeProjectProgressPercent(phases: ProgressPhaseInput[]): number {
  if (phases.length === 0) return 0;
  const weightSum = phases.reduce((sum, p) => sum + Math.max(0, p.progressWeight), 0);
  if (weightSum <= 0) {
    const avg =
      phases.reduce((sum, p) => sum + phaseCompletionRatio(p), 0) / phases.length;
    return Math.round(avg * 100);
  }
  const scored = phases.reduce(
    (sum, p) => sum + Math.max(0, p.progressWeight) * phaseCompletionRatio(p),
    0
  );
  return Math.min(100, Math.max(0, Math.round(scored / weightSum * 100)));
}
