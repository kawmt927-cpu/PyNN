import type { ContractBusinessType, ContractStatus, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** 不随项目回写的合同状态 */
const LOCKED_CONTRACT_STATUSES: ContractStatus[] = [
  "PENDING_APPROVAL",
  "REJECTED",
  "PENDING_SIGN",
  "TERMINATED",
];

/**
 * 项目状态 → 合同状态。
 * CLOSED：维保合同保持维保中，其余保持已验收（终止仅人工）。
 */
export function mapProjectStatusToContractStatus(
  projectStatus: ProjectStatus,
  businessType: ContractBusinessType | null | undefined
): ContractStatus | null {
  switch (projectStatus) {
    case "PENDING_START":
      return "SIGNED_PENDING_IMPL";
    case "IMPLEMENTING":
      return "IMPLEMENTING";
    case "ACCEPTED":
      return "ACCEPTED";
    case "MAINTAINING":
      return "MAINTAINING";
    case "CLOSED":
      return businessType === "MAINTENANCE" ? "MAINTAINING" : "ACCEPTED";
    default:
      return null;
  }
}

/** 按关联项目当前状态回写合同（无项目或锁定状态则跳过） */
export async function syncContractStatusFromProject(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      contractId: true,
      contract: {
        select: {
          id: true,
          status: true,
          businessType: true,
        },
      },
    },
  });
  if (!project?.contractId || !project.contract) return;

  const contract = project.contract;
  if (LOCKED_CONTRACT_STATUSES.includes(contract.status)) return;

  const next = mapProjectStatusToContractStatus(project.status, contract.businessType);
  if (!next || next === contract.status) return;

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: next },
  });
}
