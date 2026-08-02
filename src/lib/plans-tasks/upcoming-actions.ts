import { endOfWeek, startOfWeek } from "date-fns";
import type { UserRole } from "@prisma/client";
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
      assignmentKind: string;
      assignmentStatus: string;
      /** 被指派人（执行人） */
      assignee: UpcomingActionOwner;
      /** 指派人 */
      assignedBy: UpcomingActionOwner;
      /** @deprecated 兼容旧展示，等同 assignee */
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

/** 指派任务：截止不晚于本周日（含已逾期未完成），避免普通任务被漏出本周待办 */
function isAssignmentInThisWeekScope(dueAt: Date, weekEnd: Date) {
  return dueAt <= weekEnd;
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

  const [dueFollowUps, upcomingFollowUps, assignments] = await Promise.all([
    getPendingFollowUps(role, userId, "due", now, take),
    getPendingFollowUps(role, userId, "upcoming", now, take * 2),
    managerView
      ? listPendingWeeklyAssignmentsForManager(take * 2)
      : listPendingWeeklyAssignmentsForUser(userId, take * 2),
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
      .filter((task) => isAssignmentInThisWeekScope(task.dueAt, week.weekEnd))
      .map((task) => {
        const assignee = { id: task.assignee.id, name: task.assignee.name };
        const assignedBy = { id: task.createdBy.id, name: task.createdBy.name };
        const isGeneral = task.kind === "GENERAL";
        return {
          kind: "assignment" as const,
          id: task.id,
          title: isGeneral ? task.title : (task.customer?.name ?? task.title),
          subtitle: isGeneral
            ? task.description ??
              (task.status === "PENDING_CONFIRM" ? "待指派人确认完成" : "普通任务")
            : task.title + (task.description ? ` · ${task.description}` : ""),
          dueAt: task.dueAt,
          customerId: task.customer?.id ?? null,
          customerName: task.customer?.name ?? null,
          opportunityId: task.opportunity?.id ?? null,
          opportunityTitle: task.opportunity?.title ?? null,
          assignmentKind: task.kind,
          assignmentStatus: task.status,
          assignee,
          assignedBy,
          owner: assignee,
          overdue: task.dueAt <= now,
        };
      }),
  ];

  return {
    items: items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()).slice(0, take),
    week,
  };
}
