import type { FollowUpMethod, Prisma } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import {
  getGradeExpiryPendingCustomers,
  getGradeFollowUpUpcomingCustomers,
  getCustomerGradeExpiryPending,
} from "@/lib/customers/grade-expiry";
import { addDays } from "@/lib/customers/grade-intervals";
import { pendingFollowUpOpportunityWhere } from "@/lib/opportunities/status";
import { pendingFollowUpPlanContent } from "@/lib/sales-log/next-follow-up-plan";

export type UnifiedFollowUpHistoryItem = {
  id: string;
  source: "customer" | "opportunity";
  method: FollowUpMethod;
  content: string;
  result: string | null;
  followUpAt: Date;
  nextFollowUpAt: Date | null;
  nextFollowUpMethod?: FollowUpMethod | null;
  nextFollowUpContent?: string | null;
  user: { name: string };
  contacts: { id: string; name: string }[];
  opportunity: { id: string; title: string } | null;
  changeSummary: string | null;
};

export type UnifiedPendingFollowUp = {
  id: string;
  source: "customer" | "opportunity" | "grade_expiry";
  method: FollowUpMethod | null;
  content: string;
  nextFollowUpAt: Date;
  customer: { id: string; name: string; customerGrade: string | null };
  owner: { id: string; name: string };
  user: { name: string } | null;
  opportunity: { id: string; title: string } | null;
};

export type CustomerPendingFollowPlan = {
  id: string;
  source: "customer" | "opportunity" | "grade_expiry";
  method: FollowUpMethod | null;
  nextFollowUpMethod: FollowUpMethod | null;
  content: string;
  nextFollowUpAt: Date;
  followUpAt: Date | null;
  opportunity: { id: string; title: string } | null;
  userName: string | null;
  isOverdue: boolean;
};

export type SerializedCustomerPendingFollowPlan = Omit<
  CustomerPendingFollowPlan,
  "nextFollowUpAt" | "followUpAt"
> & {
  nextFollowUpAt: string;
  followUpAt: string | null;
};

export function serializeCustomerPendingFollowPlan(
  item: CustomerPendingFollowPlan
): SerializedCustomerPendingFollowPlan {
  return {
    ...item,
    nextFollowUpAt: item.nextFollowUpAt.toISOString(),
    followUpAt: item.followUpAt?.toISOString() ?? null,
  };
}

function customerOwnerFilter(role: UserRole, userId: string) {
  if (role === "SALES") {
    return {
      OR: [
        { ownerId: userId },
        { assistantOwners: { some: { userId } } },
      ],
    };
  }
  return {};
}

function nextFollowUpTimeFilter(
  mode: "due" | "upcoming",
  now: Date,
  withinDays?: number | null
) {
  if (mode === "due") return { lte: now };
  const filter: Prisma.DateTimeFilter = { gt: now };
  if (withinDays != null) {
    filter.lte = addDays(now, withinDays);
  }
  return filter;
}

function buildCustomerPendingFollowUpWhere(
  mode: "due" | "upcoming",
  now: Date,
  customerFilter: Prisma.CustomerWhereInput,
  withinDays?: number | null
): Prisma.FollowUpWhereInput {
  return {
    nextFollowUpAt: nextFollowUpTimeFilter(mode, now, withinDays),
    customer: customerFilter,
    OR: [{ opportunityId: null }, { opportunity: pendingFollowUpOpportunityWhere }],
  };
}

function buildOpportunityPendingFollowUpWhere(
  mode: "due" | "upcoming",
  now: Date,
  customerFilter: Prisma.CustomerWhereInput,
  withinDays?: number | null
): Prisma.OpportunityFollowUpWhereInput {
  return {
    nextFollowUpAt: nextFollowUpTimeFilter(mode, now, withinDays),
    opportunity: {
      ...pendingFollowUpOpportunityWhere,
      customer: customerFilter,
    },
  };
}

export async function getCustomerFollowUpHistory(
  customerId: string,
  take = 50
): Promise<UnifiedFollowUpHistoryItem[]> {
  const db = getPrismaClient();

  const [customerFollowUps, opportunityFollowUps] = await Promise.all([
    db.followUp.findMany({
      where: { customerId },
      include: {
        user: { select: { name: true } },
        contact: { select: { id: true, name: true } },
        linkedContacts: {
          include: { contact: { select: { id: true, name: true } } },
        },
        opportunity: { select: { id: true, title: true } },
      },
    }),
    db.opportunityFollowUp.findMany({
      where: { opportunity: { customerId } },
      include: {
        user: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
      },
    }),
  ]);

  const unified: UnifiedFollowUpHistoryItem[] = [
    ...customerFollowUps.map((item) => {
      const contacts =
        item.linkedContacts.length > 0
          ? item.linkedContacts.map((link) => link.contact)
          : item.contact
            ? [item.contact]
            : [];
      return {
        id: item.id,
        source: "customer" as const,
        method: item.method,
        content: item.content,
        result: item.result,
        followUpAt: item.followUpAt,
        nextFollowUpAt: item.nextFollowUpAt,
        nextFollowUpMethod: item.nextFollowUpMethod,
        nextFollowUpContent: item.nextFollowUpContent,
        user: item.user,
        contacts,
        opportunity: item.opportunity,
        changeSummary: null,
      };
    }),
    ...opportunityFollowUps.map((item) => ({
      id: item.id,
      source: "opportunity" as const,
      method: item.method,
      content: item.content,
      result: null,
      followUpAt: item.followUpAt,
      nextFollowUpAt: item.nextFollowUpAt,
      nextFollowUpMethod: null,
      nextFollowUpContent: item.nextFollowUpContent,
      user: item.user,
      contacts: [],
      opportunity: item.opportunity,
      changeSummary: item.changeSummary,
    })),
  ];

  return unified
    .sort((a, b) => b.followUpAt.getTime() - a.followUpAt.getTime())
    .slice(0, take);
}

export async function countCustomerFollowUps(customerId: string) {
  const db = getPrismaClient();
  const [customerCount, opportunityCount] = await Promise.all([
    db.followUp.count({ where: { customerId } }),
    db.opportunityFollowUp.count({
      where: { opportunity: { customerId } },
    }),
  ]);
  return customerCount + opportunityCount;
}

export async function getCustomerPendingFollowPlans(
  customerId: string,
  now: Date
): Promise<CustomerPendingFollowPlan[]> {
  const db = getPrismaClient();

  const [customerItems, opportunityItems, gradeExpiry] = await Promise.all([
    db.followUp.findMany({
      where: {
        customerId,
        nextFollowUpAt: { not: null },
        OR: [{ opportunityId: null }, { opportunity: pendingFollowUpOpportunityWhere }],
      },
      include: {
        user: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
      },
      orderBy: { nextFollowUpAt: "asc" },
    }),
    db.opportunityFollowUp.findMany({
      where: {
        nextFollowUpAt: { not: null },
        opportunity: {
          customerId,
          ...pendingFollowUpOpportunityWhere,
        },
      },
      include: {
        user: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
      },
      orderBy: { nextFollowUpAt: "asc" },
    }),
    getCustomerGradeExpiryPending(customerId, now),
  ]);

  const unified: CustomerPendingFollowPlan[] = [
    ...customerItems
      .filter((item): item is typeof item & { nextFollowUpAt: Date } => Boolean(item.nextFollowUpAt))
      .map((item) => ({
        id: item.id,
        source: "customer" as const,
        method: item.method,
        nextFollowUpMethod: item.nextFollowUpMethod,
        content: pendingFollowUpPlanContent(item.nextFollowUpContent, item.content),
        nextFollowUpAt: item.nextFollowUpAt,
        followUpAt: item.followUpAt,
        opportunity: item.opportunity,
        userName: item.user.name,
        isOverdue: item.nextFollowUpAt <= now,
      })),
    ...opportunityItems
      .filter((item): item is typeof item & { nextFollowUpAt: Date } => Boolean(item.nextFollowUpAt))
      .map((item) => ({
        id: item.id,
        source: "opportunity" as const,
        method: item.method,
        nextFollowUpMethod: null,
        content: pendingFollowUpPlanContent(item.nextFollowUpContent, item.content),
        nextFollowUpAt: item.nextFollowUpAt,
        followUpAt: item.followUpAt,
        opportunity: item.opportunity,
        userName: item.user.name,
        isOverdue: item.nextFollowUpAt <= now,
      })),
  ];

  if (gradeExpiry) {
    unified.push({
      id: `grade-expiry:${customerId}`,
      source: "grade_expiry",
      method: null,
      nextFollowUpMethod: null,
      content: "超过等级规定的往来间隔，需尽快跟进",
      nextFollowUpAt: gradeExpiry.dueAt,
      followUpAt: gradeExpiry.lastInteractionAt,
      opportunity: null,
      userName: null,
      isOverdue: true,
    });
  }

  return unified.sort((a, b) => a.nextFollowUpAt.getTime() - b.nextFollowUpAt.getTime());
}

type CompletePendingInput = {
  source: "customer" | "opportunity" | "grade_expiry";
  id: string;
};

export function parsePendingPlanSelectionKey(key: string): CompletePendingInput | null {
  const [source, ...idParts] = key.split(":");
  const id = idParts.join(":");
  if (source !== "customer" && source !== "opportunity" && source !== "grade_expiry") return null;
  if (!id) return null;
  return { source, id };
}

export function pendingPlanSelectionKey(source: string, id: string) {
  return `${source}:${id}`;
}

export async function completeCustomerPendingFollowPlan(
  tx: Prisma.TransactionClient,
  customerId: string,
  input: CompletePendingInput
) {
  if (input.source === "grade_expiry") return;

  if (input.source === "customer") {
    const updated = await tx.followUp.updateMany({
      where: { id: input.id, customerId, nextFollowUpAt: { not: null } },
      data: { nextFollowUpAt: null, nextFollowUpMethod: null, nextFollowUpContent: null },
    });
    if (updated.count === 0) throw new Error("所选待跟进计划无效或已完成");
    const { completeWeeklyAssignmentForFollowUpPlan } = await import(
      "@/lib/today-work/create-weekly-assignment"
    );
    await completeWeeklyAssignmentForFollowUpPlan(tx, input.id);
    return;
  }

  const followUp = await tx.opportunityFollowUp.findFirst({
    where: {
      id: input.id,
      nextFollowUpAt: { not: null },
      opportunity: { customerId, ...pendingFollowUpOpportunityWhere },
    },
    select: { opportunityId: true },
  });
  if (!followUp) throw new Error("所选待跟进计划无效或已完成");

  await tx.opportunityFollowUp.update({
    where: { id: input.id },
    data: { nextFollowUpAt: null, nextFollowUpContent: null },
  });
}

export type PendingFollowUpQueryOptions = {
  withinDays?: number | null;
};

export async function getPendingFollowUps(
  role: UserRole,
  userId: string,
  mode: "due" | "upcoming",
  now: Date,
  take: number,
  options?: PendingFollowUpQueryOptions
): Promise<UnifiedPendingFollowUp[]> {
  const withinDays = mode === "upcoming" ? options?.withinDays : undefined;
  const db = getPrismaClient();
  const customerFilter = customerOwnerFilter(role, userId);
  const queryTake = mode === "upcoming" && withinDays == null ? take * 20 : take * 2;

  const [customerItems, opportunityItems] = await Promise.all([
    db.followUp.findMany({
      where: buildCustomerPendingFollowUpWhere(mode, now, customerFilter, withinDays),
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            customerGrade: true,
            owner: { select: { id: true, name: true } },
          },
        },
        user: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
      },
      take: queryTake,
    }),
    db.opportunityFollowUp.findMany({
      where: buildOpportunityPendingFollowUpWhere(mode, now, customerFilter, withinDays),
      include: {
        user: { select: { name: true } },
        opportunity: {
          select: {
            id: true,
            title: true,
            customer: {
              select: {
                id: true,
                name: true,
                customerGrade: true,
                owner: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      take: queryTake,
    }),
  ]);

  const unified: UnifiedPendingFollowUp[] = [
    ...customerItems
      .filter((item): item is typeof item & { nextFollowUpAt: Date } =>
        Boolean(item.nextFollowUpAt)
      )
      .map((item) => ({
        id: item.id,
        source: "customer" as const,
        method: item.method,
        content: pendingFollowUpPlanContent(item.nextFollowUpContent, item.content),
        nextFollowUpAt: item.nextFollowUpAt,
        customer: item.customer,
        owner: item.customer.owner ?? { id: "", name: "未分配" },
        user: item.user,
        opportunity: item.opportunity
          ? { id: item.opportunity.id, title: item.opportunity.title }
          : null,
      })),
    ...opportunityItems
      .filter((item): item is typeof item & { nextFollowUpAt: Date } =>
        Boolean(item.nextFollowUpAt)
      )
      .map((item) => ({
        id: item.id,
        source: "opportunity" as const,
        method: item.method,
        content: pendingFollowUpPlanContent(item.nextFollowUpContent, item.content),
        nextFollowUpAt: item.nextFollowUpAt,
        customer: item.opportunity.customer,
        owner: item.opportunity.customer.owner ?? { id: "", name: "未分配" },
        user: item.user,
        opportunity: { id: item.opportunity.id, title: item.opportunity.title },
      })),
  ];

  if (mode === "due") {
    const gradeExpiry = await getGradeExpiryPendingCustomers(role, userId, now, take);
    const existingCustomerIds = new Set(unified.map((item) => item.customer.id));
    for (const item of gradeExpiry) {
      if (existingCustomerIds.has(item.customerId)) continue;
      unified.push({
        id: `grade-expiry:${item.customerId}`,
        source: "grade_expiry",
        method: null,
        content: "超过等级规定的往来间隔，需尽快跟进",
        nextFollowUpAt: item.dueAt,
        customer: {
          id: item.customerId,
          name: item.customerName,
          customerGrade: item.customerGrade,
        },
        owner: item.owner,
        user: null,
        opportunity: null,
      });
    }
  } else {
    const gradeUpcoming = await getGradeFollowUpUpcomingCustomers(
      role,
      userId,
      now,
      withinDays ?? null
    );
    const existingCustomerIds = new Set(unified.map((item) => item.customer.id));
    for (const item of gradeUpcoming) {
      if (existingCustomerIds.has(item.customerId)) continue;
      unified.push({
        id: `grade-expiry:${item.customerId}`,
        source: "grade_expiry",
        method: null,
        content: "按等级往来间隔即将到期，请安排跟进",
        nextFollowUpAt: item.dueAt,
        customer: {
          id: item.customerId,
          name: item.customerName,
          customerGrade: item.customerGrade,
        },
        owner: item.owner,
        user: null,
        opportunity: null,
      });
    }
  }

  const limit = mode === "upcoming" && withinDays == null ? unified.length : take;
  return unified
    .sort((a, b) => a.nextFollowUpAt.getTime() - b.nextFollowUpAt.getTime())
    .slice(0, limit);
}

export async function countDueFollowUps(role: UserRole, userId: string, now: Date) {
  const db = getPrismaClient();
  const customerFilter = customerOwnerFilter(role, userId);

  const [customerCount, opportunityCount] = await Promise.all([
    db.followUp.count({
      where: buildCustomerPendingFollowUpWhere("due", now, customerFilter),
    }),
    db.opportunityFollowUp.count({
      where: buildOpportunityPendingFollowUpWhere("due", now, customerFilter),
    }),
  ]);

  return customerCount + opportunityCount;
}
