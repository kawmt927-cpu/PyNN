import type { ContractStatus } from "@prisma/client";

/** 待销售管理审核的合同状态（含历史遗留的待签署） */
export const PENDING_CONTRACT_APPROVAL_STATUSES: ContractStatus[] = [
  "PENDING_APPROVAL",
  "PENDING_SIGN",
];

export function isPendingContractApproval(status: ContractStatus) {
  return PENDING_CONTRACT_APPROVAL_STATUSES.includes(status);
}

export function pendingContractApprovalFilter() {
  return { status: { in: PENDING_CONTRACT_APPROVAL_STATUSES } };
}
