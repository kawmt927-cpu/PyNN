import { prisma } from "@/lib/prisma";

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

  return prisma.project.create({
    data: {
      name: contract.title,
      customerId: contract.endUserCustomerId,
      contractId: contract.id,
      status: "PENDING_START",
    },
  });
}
