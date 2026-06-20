import { OpportunityStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function canViewAllOpportunities(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function canManageOpportunityOwner(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function canManageOpportunityStatus(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

/** 编辑商机内容、跟进（已放弃不可） */
export function canEditOpportunityContent(
  role: UserRole,
  userId: string,
  opportunity: { ownerId: string; status: OpportunityStatus }
) {
  if (opportunity.status === "ABANDONED") return false;
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

export async function getOpportunityForUser(id: string, role: UserRole, userId: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, ownerId: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  if (!opportunity) return null;
  if (!canViewAllOpportunities(role) && opportunity.ownerId !== userId) return null;
  return opportunity;
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
  if (!canViewAllContracts(role) && contract.ownerId !== userId) return null;
  return contract;
}
