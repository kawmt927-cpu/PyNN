import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import {
  addDays,
  computeGradeFollowUpDueAt,
  getCustomerGradeIntervalMap,
  resolveGradeIntervalDays,
} from "@/lib/customers/grade-intervals";

export type GradeExpiryPendingItem = {
  kind: "grade_expiry";
  customerId: string;
  customerName: string;
  customerGrade: string | null;
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

export async function getCustomerGradeFollowUpSchedule(input: {
  customerId: string;
  customerGrade: string | null;
  customerCreatedAt: Date;
}): Promise<CustomerGradeFollowUpSchedule | null> {
  const intervalMap = await getCustomerGradeIntervalMap();
  const intervalDays = resolveGradeIntervalDays(input.customerGrade, intervalMap);
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
  const intervalMap = await getCustomerGradeIntervalMap();
  const customers = await prisma.customer.findMany({
    where: customerOwnerFilter(role, userId),
    select: {
      id: true,
      name: true,
      customerGrade: true,
      createdAt: true,
      owner: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const lastInteractionMap = await getLastInteractionMap(customers.map((c) => c.id));
  const items: GradeExpiryPendingItem[] = [];

  for (const customer of customers) {
    const intervalDays = resolveGradeIntervalDays(customer.customerGrade, intervalMap);
    if (!intervalDays) continue;

    const lastInteractionAt = lastInteractionMap.get(customer.id) ?? customer.createdAt;
    const dueAt = computeGradeFollowUpDueAt(lastInteractionAt, intervalDays);

    items.push({
      kind: "grade_expiry",
      customerId: customer.id,
      customerName: customer.name,
      customerGrade: customer.customerGrade,
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
      createdAt: true,
      owner: { select: { id: true, name: true } },
    },
  });
  if (!customer) return null;

  const schedule = await getCustomerGradeFollowUpSchedule({
    customerId: customer.id,
    customerGrade: customer.customerGrade,
    customerCreatedAt: customer.createdAt,
  });
  if (!schedule || schedule.dueAt > now) return null;

  return {
    kind: "grade_expiry",
    customerId: customer.id,
    customerName: customer.name,
    customerGrade: customer.customerGrade,
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
