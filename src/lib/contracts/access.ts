import { ContractStatus, UserRole } from "@prisma/client";

export function canManageContractApproval(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function canRecordContractPayment(role: UserRole) {
  return role === "SALES" || role === "SALES_MANAGER" || role === "ADMIN";
}

export function canEditRejectedContract(
  role: UserRole,
  userId: string,
  contract: { ownerId: string; status: ContractStatus }
) {
  if (contract.status !== "REJECTED") return false;
  if (canManageContractApproval(role)) return true;
  return contract.ownerId === userId;
}

/** 已签署及之后状态，计入 KPI */
export const SIGNED_CONTRACT_STATUSES: ContractStatus[] = [
  "SIGNED_PENDING_IMPL",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
  "TERMINATED",
];

export function isSignedContractStatus(status: ContractStatus) {
  return SIGNED_CONTRACT_STATUSES.includes(status);
}

export function signedContractStatusFilter() {
  return { status: { in: SIGNED_CONTRACT_STATUSES } };
}
