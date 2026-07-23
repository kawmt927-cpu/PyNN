import type { UserRole } from "@prisma/client";
import { withReturnTo } from "@/lib/navigation/return-to";
import { prisma } from "@/lib/prisma";

export type WeeklyAssignmentListItem = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  status: string;
  followUpId: string | null;
  customer: { id: string; name: string; customerGrade: string | null } | null;
  opportunity: { id: string; title: string } | null;
  assignee: { id: string; name: string };
  createdBy: { id: string; name: string };
};

const listInclude = {
  customer: { select: { id: true, name: true, customerGrade: true } },
  opportunity: { select: { id: true, title: true } },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  followUp: {
    select: {
      nextFollowUpMethod: true,
      contact: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listAllAssignmentsForUser(userId: string, take = 100) {
  return prisma.salesWeeklyAssignment.findMany({
    where: { assigneeId: userId, status: { not: "CANCELLED" } },
    orderBy: [{ dueAt: "desc" }],
    take,
    include: listInclude,
  });
}

export async function listAllAssignmentsForManager(take = 200) {
  return prisma.salesWeeklyAssignment.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: [{ dueAt: "desc" }],
    take,
    include: listInclude,
  });
}

export async function listPendingWeeklyAssignmentsForUser(
  userId: string,
  take = 20
): Promise<WeeklyAssignmentListItem[]> {
  return prisma.salesWeeklyAssignment.findMany({
    where: { assigneeId: userId, status: "PENDING" },
    orderBy: [{ dueAt: "asc" }],
    take,
    include: listInclude,
  });
}

export async function listWeeklyAssignmentsForManager(take = 100): Promise<WeeklyAssignmentListItem[]> {
  return prisma.salesWeeklyAssignment.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: [{ dueAt: "asc" }],
    take,
    include: listInclude,
  });
}

export async function hasPendingWeeklyAssignmentForCustomer(
  userId: string,
  customerId: string
) {
  const row = await prisma.salesWeeklyAssignment.findFirst({
    where: {
      assigneeId: userId,
      customerId,
      status: "PENDING",
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function hasPendingWeeklyAssignmentForOpportunity(
  userId: string,
  opportunityId: string
) {
  const row = await prisma.salesWeeklyAssignment.findFirst({
    where: {
      assigneeId: userId,
      opportunityId,
      status: "PENDING",
    },
    select: { id: true },
  });
  return Boolean(row);
}

export function weeklyAssignmentFollowUpHref(
  item: Pick<WeeklyAssignmentListItem, "customer" | "opportunity">,
  returnTo: string
) {
  if (item.opportunity) {
    return withReturnTo(`/opportunities/${item.opportunity.id}/follow-ups`, returnTo);
  }
  if (item.customer) {
    return withReturnTo(`/customers/${item.customer.id}/follow-ups`, returnTo);
  }
  return null;
}

export async function listPendingWeeklyAssignmentsForManager(take = 50): Promise<WeeklyAssignmentListItem[]> {
  return prisma.salesWeeklyAssignment.findMany({
    where: { status: "PENDING" },
    orderBy: [{ dueAt: "asc" }],
    take,
    include: listInclude,
  });
}

export function canManageWeeklyAssignments(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}
