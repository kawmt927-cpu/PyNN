import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import {
  addDays,
  computeGradeFollowUpDueAt,
  getGradeIntervalMaps,
  pickGradeIntervalMap,
  resolveGradeIntervalDays,
} from "@/lib/customers/grade-intervals";
import {
  getOpportunityGradeIntervalMap,
  resolveOpportunityGradeIntervalDays,
} from "@/lib/opportunities/grade-intervals";
import {
  customerTypeRequiresGrade,
  isChannelCustomerType,
} from "@/lib/customers/customer-type-grade";
import { CONFIG_CATEGORY } from "@/lib/config-options";

export type GradeExpiryPendingItem = {
  kind: "grade_expiry";
  customerId: string;
  customerName: string;
  customerGrade: string | null;
  customerType?: string | null;
  owner: { id: string; name: string };
  dueAt: Date;
  lastInteractionAt: Date;
  overdue: boolean;
};

export type CustomerGradeFollowUpSchedule = {
  intervalDays: number;
  lastInteractionAt: Date;
  dueAt: Date;
};

async function resolveCustomerFollowUpIntervalDays(input: {
  customerId: string;
  customerGrade: string | null;
  customerType?: string | null;
}): Promise<number | null> {
  const oppIntervalMap = await getOpportunityGradeIntervalMap();
  const gradedOpportunities = await prisma.opportunity.findMany({
    where: {
      customerId: input.customerId,
      status: "NOT_SIGNED",
      grade: { not: null },
    },
    select: { grade: true },
  });

  if (gradedOpportunities.length > 0) {
    const oppIntervals = gradedOpportunities
      .map((row) => resolveOpportunityGradeIntervalDays(row.grade, oppIntervalMap))
      .filter((days): days is number => days != null && days > 0);
    if (oppIntervals.length > 0) {
      // 客户名下存在未签约且已设等级的商机时，优先按商机等级中最短往来间隔计算（高于客户等级间隔）
      return Math.min(...oppIntervals);
    }
  }

  const { getConfigOptions } = await import("@/lib/config-options");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  const maps = await getGradeIntervalMaps();
  const intervalMap = pickGradeIntervalMap(
    isChannelCustomerType(input.customerType, typeOptions) ? "CHANNEL" : "DIRECT",
    maps
  );
  return resolveGradeIntervalDays(input.customerGrade, intervalMap);
}

export async function getCustomerGradeFollowUpSchedule(input: {
  customerId: string;
  customerGrade: string | null;
  customerCreatedAt: Date;
  customerType?: string | null;
}): Promise<CustomerGradeFollowUpSchedule | null> {
  const { getConfigOptions } = await import("@/lib/config-options");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  if (
    input.customerType != null &&
    !customerTypeRequiresGrade(input.customerType, typeOptions)
  ) {
    return null;
  }
  const intervalDays = await resolveCustomerFollowUpIntervalDays({
    customerId: input.customerId,
    customerGrade: input.customerGrade,
    customerType: input.customerType,
  });
  if (!intervalDays) return null;

  const lastInteractionMap = await getLastInteractionMap([input.customerId]);
  const lastInteractionAt =
    lastInteractionMap.get(input.customerId) ?? input.customerCreatedAt;
  const dueAt = computeGradeFollowUpDueAt(lastInteractionAt, intervalDays);

  return { intervalDays, lastInteractionAt, dueAt };
}

function customerOwnerFilter(role: UserRole, userId: string) {
  return role === "SALES"
    ? {
        OR: [
          { ownerId: userId },
          { assistantOwners: { some: { userId } } },
        ],
      }
    : {};
}

async function getLastInteractionMap(customerIds: string[]): Promise<Map<string, Date>> {
  if (customerIds.length === 0) return new Map();

  const [customerFollowUps, opportunityFollowUps, customers] = await Promise.all([
    prisma.followUp.groupBy({
      by: ["customerId"],
      where: { customerId: { in: customerIds } },
      _max: { followUpAt: true },
    }),
    prisma.opportunityFollowUp.findMany({
      where: { opportunity: { customerId: { in: customerIds } } },
      select: { followUpAt: true, opportunity: { select: { customerId: true } } },
    }),
    prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, createdAt: true },
    }),
  ]);

  const map = new Map<string, Date>();
  for (const customer of customers) {
    map.set(customer.id, customer.createdAt);
  }
  for (const row of customerFollowUps) {
    const at = row._max.followUpAt;
    if (!at) continue;
    const prev = map.get(row.customerId);
    if (!prev || at > prev) map.set(row.customerId, at);
  }
  for (const row of opportunityFollowUps) {
    const customerId = row.opportunity.customerId;
    if (!customerId) continue;
    const prev = map.get(customerId);
    if (!prev || row.followUpAt > prev) map.set(customerId, row.followUpAt);
  }
  return map;
}

async function listGradeFollowUpScheduleItems(
  role: UserRole,
  userId: string,
  now: Date
): Promise<GradeExpiryPendingItem[]> {
  const maps = await getGradeIntervalMaps();
  const { getConfigOptions } = await import("@/lib/config-options");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  const customers = await prisma.customer.findMany({
    where: customerOwnerFilter(role, userId),
    select: {
      id: true,
      name: true,
      customerGrade: true,
      customerType: true,
      createdAt: true,
      owner: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const oppIntervalMap = await getOpportunityGradeIntervalMap();
  const gradedOpportunities = await prisma.opportunity.findMany({
    where: {
      customerId: { in: customers.map((c) => c.id) },
      status: "NOT_SIGNED",
      grade: { not: null },
    },
    select: { customerId: true, grade: true },
  });
  const oppIntervalsByCustomer = new Map<string, number[]>();
  for (const row of gradedOpportunities) {
    if (!row.customerId || !row.grade) continue;
    const days = resolveOpportunityGradeIntervalDays(row.grade, oppIntervalMap);
    if (days == null || days <= 0) continue;
    const list = oppIntervalsByCustomer.get(row.customerId) ?? [];
    list.push(days);
    oppIntervalsByCustomer.set(row.customerId, list);
  }

  const lastInteractionMap = await getLastInteractionMap(customers.map((c) => c.id));
  const items: GradeExpiryPendingItem[] = [];

  for (const customer of customers) {
    if (!customerTypeRequiresGrade(customer.customerType, typeOptions)) continue;

    const oppIntervals = oppIntervalsByCustomer.get(customer.id);
    let intervalDays: number | null = null;
    if (oppIntervals?.length) {
      intervalDays = Math.min(...oppIntervals);
    } else {
      const intervalMap = pickGradeIntervalMap(
        isChannelCustomerType(customer.customerType, typeOptions) ? "CHANNEL" : "DIRECT",
        maps
      );
      intervalDays = resolveGradeIntervalDays(customer.customerGrade, intervalMap);
    }
    if (!intervalDays) continue;

    const lastInteractionAt = lastInteractionMap.get(customer.id) ?? customer.createdAt;
    const dueAt = computeGradeFollowUpDueAt(lastInteractionAt, intervalDays);

    items.push({
      kind: "grade_expiry",
      customerId: customer.id,
      customerName: customer.name,
      customerGrade: customer.customerGrade,
      customerType: customer.customerType,
      owner: customer.owner ?? { id: "", name: "未分配" },
      dueAt,
      lastInteractionAt,
      overdue: dueAt.getTime() <= now.getTime(),
    });
  }

  return items;
}

export async function getGradeExpiryPendingCustomers(
  role: UserRole,
  userId: string,
  now: Date,
  take = 50
): Promise<GradeExpiryPendingItem[]> {
  return (await listGradeFollowUpScheduleItems(role, userId, now))
    .filter((item) => item.overdue)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, take);
}

export async function getGradeFollowUpUpcomingCustomers(
  role: UserRole,
  userId: string,
  now: Date,
  withinDays: number | null
): Promise<GradeExpiryPendingItem[]> {
  const maxDueAt = withinDays == null ? null : addDays(now, withinDays);

  return (await listGradeFollowUpScheduleItems(role, userId, now))
    .filter((item) => {
      if (item.overdue) return false;
      if (!maxDueAt) return true;
      return item.dueAt.getTime() <= maxDueAt.getTime();
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export async function getCustomerGradeExpiryPending(
  customerId: string,
  now: Date
): Promise<GradeExpiryPendingItem | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      customerGrade: true,
      customerType: true,
      createdAt: true,
      owner: { select: { id: true, name: true } },
    },
  });
  if (!customer) return null;

  const schedule = await getCustomerGradeFollowUpSchedule({
    customerId: customer.id,
    customerGrade: customer.customerGrade,
    customerCreatedAt: customer.createdAt,
    customerType: customer.customerType,
  });
  if (!schedule || schedule.dueAt > now) return null;

  return {
    kind: "grade_expiry",
    customerId: customer.id,
    customerName: customer.name,
    customerGrade: customer.customerGrade,
    customerType: customer.customerType,
    owner: customer.owner ?? { id: "", name: "未分配" },
    dueAt: schedule.dueAt,
    lastInteractionAt: schedule.lastInteractionAt,
    overdue: true,
  };
}

export async function getLastInteractionBefore(
  customerId: string,
  before: Date
): Promise<Date | null> {
  const [customerFollowUp, opportunityFollowUp, customer] = await Promise.all([
    prisma.followUp.findFirst({
      where: { customerId, followUpAt: { lt: before } },
      orderBy: { followUpAt: "desc" },
      select: { followUpAt: true },
    }),
    prisma.opportunityFollowUp.findFirst({
      where: { opportunity: { customerId }, followUpAt: { lt: before } },
      orderBy: { followUpAt: "desc" },
      select: { followUpAt: true },
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { createdAt: true },
    }),
  ]);

  const candidates = [
    customerFollowUp?.followUpAt,
    opportunityFollowUp?.followUpAt,
    customer?.createdAt,
  ].filter((d): d is Date => d != null && d < before);

  if (candidates.length === 0) return customer?.createdAt ?? null;
  return candidates.reduce((max, d) => (d > max ? d : max));
}
