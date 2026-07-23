import { prisma } from "@/lib/prisma";
import { recomputePhaseWeightsByDuration } from "@/lib/projects/apply-project-model";
import { computeProjectProgressPercent } from "@/lib/projects/project-progress";

/** 按当前阶段权重与任务完成度重算并写回项目进度 */
export async function syncProjectProgress(projectId: string): Promise<number> {
  const phases = await prisma.projectPhase.findMany({
    where: { projectId },
    select: {
      id: true,
      status: true,
      progressWeight: true,
      projectTasks: { select: { status: true } },
    },
  });

  const progressPercent = computeProjectProgressPercent(
    phases.map((phase) => ({
      id: phase.id,
      status: phase.status,
      progressWeight: phase.progressWeight,
      tasks: phase.projectTasks,
    }))
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { progressPercent },
  });

  return progressPercent;
}

/** 按阶段计划工期重算权重并刷新项目进度 */
export async function syncPhaseWeightsAndProgress(projectId: string): Promise<void> {
  const phases = await prisma.projectPhase.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      plannedStartAt: true,
      plannedEndAt: true,
    },
  });

  const weights = recomputePhaseWeightsByDuration(phases);
  await prisma.$transaction(
    phases.map((phase) =>
      prisma.projectPhase.update({
        where: { id: phase.id },
        data: { progressWeight: weights.get(phase.id) ?? 0 },
      })
    )
  );

  await syncProjectProgress(projectId);
}
