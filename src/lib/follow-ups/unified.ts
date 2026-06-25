import type { FollowUpMethod, Prisma } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { getGradeExpiryPendingCustomers, getCustomerGradeExpiryPending } from "@/lib/customers/grade-expiry";
import { pendingFollowUpOpportunityWhere } from "@/lib/opportunities/status";

export type UnifiedFollowUpHistoryItem = {
  id: string;
  source: "customer" | "opportunity";
  method: FollowUpMethod;
  content: string;
  result: string | null;
  followUpAt: Date;
  nextFollowUpAt: Date | null;
  nextFollowUpMethod?: FollowUpMethod | null;
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
  return role === "SALES" ? { ownerId: userId } : {};
}

function nextFollowUpTimeFilter(mode: "due" | "upcoming", now: Date) {
  return mode === "due" ? { lte: now } : { gt: now };
}

function buildCustomerPendingFollowUpWhere(
  mode: "due" | "upcoming",
  now: Date,
  customerFilter: Prisma.CustomerWhereInput
): Prisma.FollowUpWhereInput {
  return {
    nextFollowUpAt: nextFollowUpTimeFilter(mode, now),
    customer: customerFilter,
    OR: [{ opportunityId: null }, { opportunity: pendingFollowUpOpportunityWhere }],
  };
}

function buildOpportunityPendingFollowUpWhere(
  mode: "due" | "upcoming",
  now: Date,
  customerFilter: Prisma.CustomerWhereInput
): Prisma.OpportunityFollowUpWhereInput {
  return {
    nextFollowUpAt: nextFollowUpTimeFilter(mode, now),
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
        content: item.content,
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
        content: item.content,
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
      data: { nextFollowUpAt: null, nextFollowUpMethod: null },
    });
    if (updated.count === 0) throw new Error("所选待跟进计划无效或已完成");
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
    data: { nextFollowUpAt: null },
  });
}

export async function getPendingFollowUps(
  role: UserRole,
  userId: string,
  mode: "due" | "upcoming",
  now: Date,
  take: number
): Promise<UnifiedPendingFollowUp[]> {
  const db = getPrismaClient();
  const customerFilter = customerOwnerFilter(role, userId);

  const [customerItems, opportunityItems] = await Promise.all([
    db.followUp.findMany({
      where: buildCustomerPendingFollowUpWhere(mode, now, customerFilter),
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
      take: take * 2,
    }),
    db.opportunityFollowUp.findMany({
      where: buildOpportunityPendingFollowUpWhere(mode, now, customerFilter),
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
      take: take * 2,
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
        content: item.content,
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
        content: item.content,
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
  }

  return unified
    .sort((a, b) => a.nextFollowUpAt.getTime() - b.nextFollowUpAt.getTime())
    .slice(0, take);
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
