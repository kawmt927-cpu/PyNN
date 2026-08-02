import { OpportunityStatus, UserRole } from "@prisma/client";
import { hasPendingWeeklyAssignmentForOpportunity } from "@/lib/today-work/weekly-assignments";
import { prisma } from "@/lib/prisma";

export type OpportunityAccessOptions = {
  /** 销售被指派该商机的待完成周任务时，允许访问与录入跟进 */
  allowAssignedWeeklyTask?: boolean;
};

export function canViewAllOpportunities(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function canManageOpportunityOwner(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function canManageOpportunityStatus(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

/** 编辑商机内容（已放弃不可；已签约仅销售管理/管理员） */
export function canEditOpportunityContent(
  role: UserRole,
  userId: string,
  opportunity: { ownerId: string; status: OpportunityStatus }
) {
  if (opportunity.status === "ABANDONED") return false;
  if (opportunity.status === "SIGNED") {
    return canManageOpportunityOwner(role);
  }
  if (canManageOpportunityOwner(role)) return true;
  return opportunity.ownerId === userId;
}

/** 跟进商机（仅未签约；已签约不可跟进） */
export function canFollowUpOpportunity(
  role: UserRole,
  userId: string,
  opportunity: { ownerId: string; status: OpportunityStatus }
) {
  if (opportunity.status !== "NOT_SIGNED") return false;
  if (canManageOpportunityOwner(role)) return true;
  return opportunity.ownerId === userId;
}

/** @deprecated 使用 canEditOpportunityContent */
export function canEditOpportunity(
  role: UserRole,
  userId: string,
  opportunity: { ownerId: string; status: OpportunityStatus }
) {
  return canEditOpportunityContent(role, userId, opportunity);
}

export function opportunityListWhere(role: UserRole, userId: string) {
  if (canViewAllOpportunities(role)) return {};
  return { ownerId: userId };
}

export type OpportunityListView = "not_signed" | "signed" | "abandoned" | "all";

const OPPORTUNITY_LIST_VIEW_LABELS: Record<OpportunityListView, string> = {
  not_signed: "未签约商机",
  signed: "已签约商机",
  abandoned: "已放弃商机",
  all: "全部商机",
};

export function resolveOpportunityListView(rawView: string | undefined): OpportunityListView {
  if (rawView === "signed") return "signed";
  if (rawView === "abandoned") return "abandoned";
  if (rawView === "all") return "all";
  return "not_signed";
}

export function opportunityListTabs() {
  return (["not_signed", "signed", "abandoned", "all"] as const).map((key) => ({
    key,
    label: OPPORTUNITY_LIST_VIEW_LABELS[key],
    href: key === "not_signed" ? "/opportunities" : `/opportunities?view=${key}`,
  }));
}

export function opportunityListWhereWithView(
  role: UserRole,
  userId: string,
  view: OpportunityListView = "not_signed"
) {
  const base = opportunityListWhere(role, userId);
  if (view === "all") return base;
  const statusMap: Record<Exclude<OpportunityListView, "all">, OpportunityStatus> = {
    not_signed: "NOT_SIGNED",
    signed: "SIGNED",
    abandoned: "ABANDONED",
  };
  return { ...base, status: statusMap[view] };
}

export function opportunityListViewLabel(view: OpportunityListView) {
  return OPPORTUNITY_LIST_VIEW_LABELS[view];
}

export async function getOpportunityForUser(
  id: string,
  role: UserRole,
  userId: string,
  options?: OpportunityAccessOptions
) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, ownerId: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  if (!opportunity) return null;
  if (!canViewAllOpportunities(role) && opportunity.ownerId !== userId) {
    if (
      options?.allowAssignedWeeklyTask &&
      (await hasPendingWeeklyAssignmentForOpportunity(userId, id))
    ) {
      return opportunity;
    }
    return null;
  }
  return opportunity;
}

export async function canFollowUpOpportunityForUser(
  role: UserRole,
  userId: string,
  opportunity: { id: string; ownerId: string; status: OpportunityStatus }
) {
  if (canFollowUpOpportunity(role, userId, opportunity)) return true;
  if (role !== "SALES" || opportunity.status !== "NOT_SIGNED") return false;
  return hasPendingWeeklyAssignmentForOpportunity(userId, opportunity.id);
}

export function canViewAllContracts(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN" || role === "PROJECT_MANAGER";
}

export function contractListWhere(role: UserRole, userId: string) {
  if (canViewAllContracts(role)) return {};
  return { ownerId: userId };
}

export async function getContractForUser(id: string, role: UserRole, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      signCustomer: { select: { id: true, name: true } },
      endUserCustomer: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true, expectedAmount: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!contract) return null;
  if (role === "PROJECT_MANAGER") return contract;
  if (canViewAllContracts(role)) return contract;
  if (contract.ownerId === userId) return contract;
  // 已驳回：提交人也可查看以便删除/重提
  if (contract.status === "REJECTED" && contract.submittedById === userId) return contract;
  return null;
}
