import { endOfWeek, startOfWeek } from "date-fns";
import type { UserRole } from "@prisma/client";
import { listPaymentDueItems } from "@/lib/contracts/payment-due";
import { formatAmount } from "@/lib/opportunities/funnel";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import {
  listPendingWeeklyAssignmentsForManager,
  listPendingWeeklyAssignmentsForUser,
} from "@/lib/today-work/weekly-assignments";

export type UpcomingActionOwner = {
  id: string;
  name: string;
};

export type UpcomingActionItem =
  | {
      kind: "follow_up";
      id: string;
      source: "customer" | "opportunity";
      title: string;
      subtitle: string;
      dueAt: Date;
      customerId: string;
      customerName: string;
      customerGrade: string | null;
      opportunityId: string | null;
      opportunityTitle: string | null;
      owner: UpcomingActionOwner;
      overdue: boolean;
    }
  | {
      kind: "assignment";
      id: string;
      title: string;
      subtitle: string;
      dueAt: Date;
      customerId: string | null;
      customerName: string | null;
      opportunityId: string | null;
      opportunityTitle: string | null;
      owner: UpcomingActionOwner;
      overdue: boolean;
    }
  | {
      kind: "payment_collection";
      id: string;
      contractId: string;
      title: string;
      subtitle: string;
      dueAt: Date;
      customerId: string;
      customerName: string;
      periodNumber: number;
      remainingAmount: number;
      owner: UpcomingActionOwner;
      overdue: boolean;
    };

export type CalendarWeekRange = {
  weekStart: Date;
  weekEnd: Date;
};

/** 自然周：周一至周日 */
export function getCalendarWeekRange(reference = new Date()): CalendarWeekRange {
  return {
    weekStart: startOfWeek(reference, { weekStartsOn: 1 }),
    weekEnd: endOfWeek(reference, { weekStartsOn: 1 }),
  };
}

function isDueThisWeek(dueAt: Date, weekStart: Date, weekEnd: Date) {
  return dueAt >= weekStart && dueAt <= weekEnd;
}

function isManagerRole(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export async function listUpcomingActionsThisWeek(
  role: UserRole,
  userId: string,
  take = 30
): Promise<{ items: UpcomingActionItem[]; week: CalendarWeekRange }> {
  const now = new Date();
  const week = getCalendarWeekRange(now);
  const managerView = isManagerRole(role);

  const [dueFollowUps, upcomingFollowUps, assignments, paymentDueItems] = await Promise.all([
    getPendingFollowUps(role, userId, "due", now, take),
    getPendingFollowUps(role, userId, "upcoming", now, take * 2),
    managerView
      ? listPendingWeeklyAssignmentsForManager(take * 2)
      : listPendingWeeklyAssignmentsForUser(userId, take * 2),
    managerView
      ? listPaymentDueItems({ now, week, take: take * 2 })
      : listPaymentDueItems({ ownerId: userId, now, week, take: take * 2 }),
  ]);

  const followUpsThisWeek = [...dueFollowUps, ...upcomingFollowUps].filter(
    (item, index, arr) =>
      isDueThisWeek(item.nextFollowUpAt, week.weekStart, week.weekEnd) &&
      arr.findIndex((x) => x.source === item.source && x.id === item.id) === index
  );

  const items: UpcomingActionItem[] = [
    ...followUpsThisWeek
      .filter((item) => item.source !== "grade_expiry")
      .map((item) => ({
        kind: "follow_up" as const,
        id: item.id,
        source: item.source as "customer" | "opportunity",
        title: item.customer.name,
        subtitle: item.content,
        dueAt: item.nextFollowUpAt,
        customerId: item.customer.id,
        customerName: item.customer.name,
        customerGrade: item.customer.customerGrade,
        opportunityId: item.opportunity?.id ?? null,
        opportunityTitle: item.opportunity?.title ?? null,
        owner: item.owner,
        overdue: item.nextFollowUpAt <= now,
      })),
    ...assignments
      .filter((task) => isDueThisWeek(task.dueAt, week.weekStart, week.weekEnd))
      .map((task) => ({
        kind: "assignment" as const,
        id: task.id,
        title: task.title,
        subtitle: task.description ?? task.customer?.name ?? task.opportunity?.title ?? "",
        dueAt: task.dueAt,
        customerId: task.customer?.id ?? null,
        customerName: task.customer?.name ?? null,
        opportunityId: task.opportunity?.id ?? null,
        opportunityTitle: task.opportunity?.title ?? null,
        owner: { id: task.assignee.id, name: task.assignee.name },
        overdue: task.dueAt <= now,
      })),
    ...paymentDueItems.map((row) => ({
      kind: "payment_collection" as const,
      id: row.installmentId,
      contractId: row.contractId,
      title: row.contractTitle,
      subtitle: `第 ${row.periodNumber} 期 · 待收 ${formatAmount(row.remainingAmount)} · ${row.customerName}`,
      dueAt: row.dueAt,
      customerId: row.customerId,
      customerName: row.customerName,
      periodNumber: row.periodNumber,
      remainingAmount: row.remainingAmount,
      owner: { id: row.ownerId, name: row.ownerName },
      overdue: row.overdue,
    })),
  ];

  return {
    items: items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()).slice(0, take),
    week,
  };
}
