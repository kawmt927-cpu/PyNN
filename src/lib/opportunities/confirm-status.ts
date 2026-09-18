import type { FollowUpConfirmStatus, UserRole } from "@prisma/client";
import {
  canEditCustomerContent,
  canManageCustomerOwner,
  type CustomerResponsibleShape,
} from "@/lib/customers/access";
import { canManageOpportunityOwner } from "@/lib/opportunities/access";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

export const OFFICIAL_OPPORTUNITY_WHERE = {
  confirmStatus: "CONFIRMED" as const,
};

/** 列表/关联可选：已确认，或本人创建且待确认 */
export function opportunitySelectableWhere(viewerUserId: string) {
  return {
    OR: [
      { confirmStatus: "CONFIRMED" as const },
      { confirmStatus: "PENDING_MANAGER" as const, ownerId: viewerUserId },
      { confirmStatus: "PENDING_MANAGER" as const, createdById: viewerUserId },
    ],
  };
}

export function resolveOpportunityConfirmStatus(input: {
  role: UserRole;
  userId: string;
  customer: CustomerResponsibleShape | null;
}): FollowUpConfirmStatus {
  if (!input.customer) {
    // 无主客户：管理可直接入库，销售待确认不合理——按创建人直接入库
    if (canManageOpportunityOwner(input.role)) return "CONFIRMED";
    return "CONFIRMED";
  }
  if (canEditCustomerContent(input.role, input.userId, input.customer)) {
    return "CONFIRMED";
  }
  return "PENDING_MANAGER";
}

export function canProposeOpportunityOnCustomer(role: UserRole) {
  if (canManageCustomerOwner(role)) return true;
  return hasPermissionSync(role, "opportunities.propose");
}

export function opportunityConfirmStatusLabel(status: FollowUpConfirmStatus): string {
  if (status === "PENDING_MANAGER") return "待确认";
  if (status === "REJECTED") return "已驳回";
  return "已入库";
}
