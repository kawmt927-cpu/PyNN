import type { FollowUpMethod, Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { getGradeExpiryPendingCustomers } from "@/lib/customers/grade-expiry";
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
  faceVisit: {
    location: string;
    department: string | null;
    detailedNotes: string;
  } | null;
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
        faceVisit: true,
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
        faceVisit: item.faceVisit,
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
      faceVisit: null,
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
