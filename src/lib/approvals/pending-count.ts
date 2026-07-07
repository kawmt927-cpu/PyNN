import { prisma } from "@/lib/prisma";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";

/** 审批中心待处理总数：客户认领 + 合同审核 */
export async function countPendingApprovals() {
  const [claims, contracts] = await Promise.all([
    prisma.customerClaimRequest.count({ where: { status: "PENDING" } }),
    prisma.contract.count({ where: pendingContractApprovalFilter() }),
  ]);
  return claims + contracts;
}
