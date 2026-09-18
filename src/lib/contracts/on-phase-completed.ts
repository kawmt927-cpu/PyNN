import { promoteInstallmentsOnPhaseCompleted } from "@/lib/contracts/sync-installment-collection";
import { notifySalesManagersOnPhaseCompleted } from "@/lib/contracts/phase-collection-notify";
import { syncContractStatusFromProject } from "@/lib/contracts/sync-contract-status-from-project";
import { prisma } from "@/lib/prisma";

/** 阶段完成统一入口：升可催款 → 提醒销管 → 回写合同状态 */
export async function handleProjectPhaseCompleted(phaseId: string) {
  const promoted = await promoteInstallmentsOnPhaseCompleted(phaseId);
  await notifySalesManagersOnPhaseCompleted({
    phaseId,
    promotedInstallments: promoted,
  });

  const phase = await prisma.projectPhase.findUnique({
    where: { id: phaseId },
    select: { projectId: true },
  });
  if (phase) {
    await syncContractStatusFromProject(phase.projectId);
  }
}
