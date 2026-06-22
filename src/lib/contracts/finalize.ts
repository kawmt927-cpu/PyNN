import { ContractStatus, Prisma } from "@prisma/client";
import { generateContractNo } from "@/lib/contracts/contract-no";

type Tx = Prisma.TransactionClient;

type FinalizeInput = {
  contractId: string;
  signedAt: Date;
  approverId: string;
};

/** 审核通过或直接签署：标记已签署、赢单、创建项目 */
export async function finalizeSignedContract(tx: Tx, input: FinalizeInput) {
  const contract = await tx.contract.findUnique({
    where: { id: input.contractId },
    include: { project: true },
  });
  if (!contract) throw new Error("合同不存在");

  const contractNo =
    contract.contractNo ?? (await generateContractNo(input.signedAt));

  await tx.contract.update({
    where: { id: input.contractId },
    data: {
      status: "SIGNED_PENDING_IMPL" satisfies ContractStatus,
      signedAt: input.signedAt,
      contractNo,
      approvedAt: new Date(),
      approvedById: input.approverId,
      rejectedAt: null,
      rejectReason: null,
    },
  });

  if (contract.opportunityId) {
    const opp = await tx.opportunity.findUnique({ where: { id: contract.opportunityId } });
    if (opp && opp.status === "NOT_SIGNED") {
      await tx.opportunity.update({
        where: { id: contract.opportunityId },
        data: { status: "SIGNED", amountLocked: true },
      });
    }
  }

  if (!contract.project) {
    await tx.project.create({
      data: {
        name: contract.title,
        customerId: contract.endUserCustomerId,
        contractId: contract.id,
        status: "PENDING_START",
      },
    });
  }
}
