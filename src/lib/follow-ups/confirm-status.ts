import type { FollowUpConfirmStatus, UserRole } from "@prisma/client";
import {
  canEditCustomerFollowUp,
  canManageCustomerOwner,
  type CustomerResponsibleShape,
} from "@/lib/customers/access";
import { canFollowUpOpportunity } from "@/lib/opportunities/access";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 正式口径（历史对外、KPI、等级到期）：仅已确认 */
export const OFFICIAL_FOLLOW_UP_WHERE = {
  confirmStatus: "CONFIRMED" as const,
};

export function resolveFollowUpConfirmStatus(input: {
  role: UserRole;
  userId: string;
  customer: CustomerResponsibleShape;
  /** 有待完成指派时免审 */
  hasPendingAssignment?: boolean;
}): FollowUpConfirmStatus {
  if (input.hasPendingAssignment) return "CONFIRMED";
  if (canEditCustomerFollowUp(input.role, input.userId, input.customer)) {
    return "CONFIRMED";
  }
  return "PENDING_MANAGER";
}

export function resolveOpportunityFollowUpConfirmStatus(input: {
  role: UserRole;
  userId: string;
  opportunity: { id: string; ownerId: string; status: "NOT_SIGNED" | "SIGNED" | "ABANDONED" };
  customer: CustomerResponsibleShape;
  hasPendingAssignment?: boolean;
}): FollowUpConfirmStatus {
  if (input.hasPendingAssignment) return "CONFIRMED";
  if (canFollowUpOpportunity(input.role, input.userId, input.opportunity)) {
    return "CONFIRMED";
  }
  if (canEditCustomerFollowUp(input.role, input.userId, input.customer)) {
    return "CONFIRMED";
  }
  return "PENDING_MANAGER";
}

/** 非负责人也可提交往来（待确认）；管理角色始终可写 */
export function canSubmitCustomerFollowUp(
  role: UserRole,
  _userId: string,
  _customer: CustomerResponsibleShape
) {
  if (canManageCustomerOwner(role)) return true;
  return hasPermissionSync(role, "follow_ups.submit_any");
}

export function followUpConfirmStatusLabel(status: FollowUpConfirmStatus): string {
  if (status === "PENDING_MANAGER") return "待确认";
  if (status === "REJECTED") return "已驳回";
  return "已入库";
}
