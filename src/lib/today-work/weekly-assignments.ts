import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WeeklyAssignmentListItem = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  status: string;
  customer: { id: string; name: string; customerGrade: string | null } | null;
  opportunity: { id: string; title: string } | null;
  assignee: { id: string; name: string };
  createdBy: { name: string };
};

const listInclude = {
  customer: { select: { id: true, name: true, customerGrade: true } },
  opportunity: { select: { id: true, title: true } },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
} as const;

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

export function weeklyAssignmentFollowUpHref(
  item: Pick<WeeklyAssignmentListItem, "customer" | "opportunity">,
  returnTo: string
) {
  if (item.opportunity) {
    return `/opportunities/${item.opportunity.id}/follow-ups?returnTo=${encodeURIComponent(returnTo)}`;
  }
  if (item.customer) {
    return `/customers/${item.customer.id}/follow-ups?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return null;
}

export function canManageWeeklyAssignments(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}
