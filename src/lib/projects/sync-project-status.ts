import { PhaseStatus, ProjectStatus, ProjectTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateProjectSetup } from "@/lib/projects/project-setup-gate";

/**
 * 子任务进入「进行中」时联动：
 * - 所属阶段若为「未开始」→「进行中」
 * - 项目若为「待启动」且基础设置已齐 →「实施中」
 */
export async function syncStatusFromTasks(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      plannedStartAt: true,
      plannedEndAt: true,
      phases: {
        select: {
          id: true,
          status: true,
          projectTasks: { select: { status: true } },
        },
      },
    },
  });
  if (!project) return;

  const phasesToStart = project.phases.filter(
    (phase) =>
      phase.status === PhaseStatus.NOT_STARTED &&
      phase.projectTasks.some((task) => task.status === ProjectTaskStatus.IN_PROGRESS)
  );

  if (phasesToStart.length > 0) {
    await prisma.projectPhase.updateMany({
      where: { id: { in: phasesToStart.map((phase) => phase.id) } },
      data: { status: PhaseStatus.IN_PROGRESS },
    });
  }

  const hasInProgressTask = project.phases.some((phase) =>
    phase.projectTasks.some((task) => task.status === ProjectTaskStatus.IN_PROGRESS)
  );

  if (project.status === ProjectStatus.PENDING_START && hasInProgressTask) {
    const setup = evaluateProjectSetup({
      plannedStartAt: project.plannedStartAt,
      plannedEndAt: project.plannedEndAt,
      phaseCount: project.phases.length,
    });
    if (setup.complete) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.IMPLEMENTING },
      });
    }
  }
}
