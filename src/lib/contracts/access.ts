import { ContractStatus, UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export function canManageContractApproval(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

/** 销售管理 / 管理员：新建、编辑、删除合同（普通销售仅可查看本人负责的合同） */
export function canEditContract(role: UserRole) {
  return canManageContractApproval(role);
}

export function canRecordContractPayment(role: UserRole) {
  return role === "SALES" || role === "SALES_MANAGER" || role === "ADMIN";
}

/** 可查看合同的销售侧角色可上传/管理附件 */
export function canManageContractAttachments(role: UserRole) {
  return role === "SALES" || role === "SALES_MANAGER" || role === "ADMIN" || role === "PROJECT_MANAGER";
}

/** 已驳回合同：发起人（提交人/负责人）或销管可改后重提 / 删除 */
export function canHandleRejectedContract(
  role: UserRole,
  userId: string,
  contract: { ownerId: string; submittedById?: string | null; status: ContractStatus }
) {
  if (contract.status !== "REJECTED") return false;
  if (canManageContractApproval(role)) return true;
  const initiatorId = contract.submittedById || contract.ownerId;
  return initiatorId === userId;
}

/** @deprecated 使用 canHandleRejectedContract */
export function canEditRejectedContract(
  role: UserRole,
  userId: string,
  contract: { ownerId: string; submittedById?: string | null; status: ContractStatus }
) {
  return canHandleRejectedContract(role, userId, contract);
}

/** 合同列表默认排除已驳回 */
export function excludeRejectedFromContractList(): Prisma.ContractWhereInput {
  return { status: { not: "REJECTED" } };
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
