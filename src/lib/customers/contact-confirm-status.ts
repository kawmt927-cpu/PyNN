import type { FollowUpConfirmStatus, UserRole } from "@prisma/client";
import {
  canEditCustomerContent,
  canManageCustomerOwner,
  type CustomerResponsibleShape,
} from "@/lib/customers/access";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

export const OFFICIAL_CONTACT_WHERE = {
  confirmStatus: "CONFIRMED" as const,
};

/** 录入往来可选：已确认 + 本人提交且待确认 */
export function contactSelectableWhere(viewerUserId: string) {
  return {
    OR: [
      { confirmStatus: "CONFIRMED" as const },
      { confirmStatus: "PENDING_MANAGER" as const, createdById: viewerUserId },
    ],
  };
}

export function resolveContactConfirmStatus(input: {
  role: UserRole;
  userId: string;
  customer: CustomerResponsibleShape;
}): FollowUpConfirmStatus {
  if (canEditCustomerContent(input.role, input.userId, input.customer)) {
    return "CONFIRMED";
  }
  return "PENDING_MANAGER";
}

/** 销售可代建联系人（待确认）；管理角色始终可建并直接入库 */
export function canProposeCustomerContact(role: UserRole) {
  if (canManageCustomerOwner(role)) return true;
  return hasPermissionSync(role, "contacts.propose");
}

export function contactConfirmStatusLabel(status: FollowUpConfirmStatus): string {
  if (status === "PENDING_MANAGER") return "待确认";
  if (status === "REJECTED") return "已驳回";
  return "已入库";
}
