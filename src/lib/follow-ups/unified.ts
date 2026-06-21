import type { FollowUpMethod } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { getGradeExpiryPendingCustomers } from "@/lib/customers/grade-expiry";

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
  contact: { name: string } | null;
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
  user: { name: string } | null;
  opportunity: { id: string; title: string } | null;
};

function customerOwnerFilter(role: UserRole, userId: string) {
  return role === "SALES" ? { ownerId: userId } : {};
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
        contact: { select: { name: true } },
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
    ...customerFollowUps.map((item) => ({
      id: item.id,
      source: "customer" as const,
      method: item.method,
      content: item.content,
      result: item.result,
      followUpAt: item.followUpAt,
      nextFollowUpAt: item.nextFollowUpAt,
      nextFollowUpMethod: item.nextFollowUpMethod,
      user: item.user,
      contact: item.contact,
      faceVisit: item.faceVisit,
      opportunity: item.opportunity,
      changeSummary: null,
    })),
    ...opportunityFollowUps.map((item) => ({
      id: item.id,
      source: "opportunity" as const,
      method: item.method,
      content: item.content,
      result: null,
      followUpAt: item.followUpAt,
      nextFollowUpAt: item.nextFollowUpAt,
      user: item.user,
      contact: null,
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

  const nextFilter = mode === "due" ? { lte: now } : { gt: now };

  const [customerItems, opportunityItems] = await Promise.all([
    db.followUp.findMany({
      where: {
        nextFollowUpAt: nextFilter,
        customer: customerFilter,
      },
      include: {
        customer: { select: { id: true, name: true, customerGrade: true } },
        user: { select: { name: true } },
      },
      take: take * 2,
    }),
    db.opportunityFollowUp.findMany({
      where: {
        nextFollowUpAt: nextFilter,
        opportunity: { customer: customerFilter },
      },
      include: {
        user: { select: { name: true } },
        opportunity: {
          select: {
            id: true,
            title: true,
            customer: { select: { id: true, name: true, customerGrade: true } },
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
        user: item.user,
        opportunity: null,
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
  const nextDue = { lte: now };

  const [customerCount, opportunityCount] = await Promise.all([
    db.followUp.count({
      where: {
        nextFollowUpAt: nextDue,
        customer: customerFilter,
        ...(role === "SALES" ? { userId } : {}),
      },
    }),
    db.opportunityFollowUp.count({
      where: {
        nextFollowUpAt: nextDue,
        opportunity: { customer: customerFilter },
        ...(role === "SALES" ? { userId } : {}),
      },
    }),
  ]);

  return customerCount + opportunityCount;
}
