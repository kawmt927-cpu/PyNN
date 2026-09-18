import { PhaseStatus, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateProjectSetup } from "@/lib/projects/project-setup-gate";
import { isProjectTaskStarted } from "@/lib/projects/task-progress";

/**
 * 子任务进入「已开工」状态时联动：
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
      phase.projectTasks.some((task) => isProjectTaskStarted(task.status))
  );

  if (phasesToStart.length > 0) {
    await prisma.projectPhase.updateMany({
      where: { id: { in: phasesToStart.map((phase) => phase.id) } },
      data: { status: PhaseStatus.IN_PROGRESS },
    });
  }

  const hasStartedTask = project.phases.some((phase) =>
    phase.projectTasks.some((task) => isProjectTaskStarted(task.status))
  );

  if (project.status === ProjectStatus.PENDING_START && hasStartedTask) {
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
      const { syncContractStatusFromProject } = await import(
        "@/lib/contracts/sync-contract-status-from-project"
      );
      await syncContractStatusFromProject(projectId);
    }
  }
}
