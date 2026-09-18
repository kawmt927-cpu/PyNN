import { prisma } from "@/lib/prisma";
import { syncContractStatusFromProject } from "@/lib/contracts/sync-contract-status-from-project";

/** 程序化建项（可选）；UI 主路径为 /projects/new?contractId= */
export async function createProjectForContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      title: true,
      endUserCustomerId: true,
      project: { select: { id: true } },
    },
  });
  if (!contract || contract.project) return contract?.project ?? null;

  const project = await prisma.project.create({
    data: {
      name: contract.title,
      customerId: contract.endUserCustomerId,
      contractId: contract.id,
      status: "PENDING_START",
    },
  });
  await syncContractStatusFromProject(project.id);
  return project;
}
