import { prisma } from "@/lib/prisma";
import { CONFIG_CATEGORY } from "@/lib/config-options";
import { normalizeCustomerGrade } from "@/lib/customers/grade";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";

const DEFAULT_GRADE_INTERVALS: Record<string, number> = {
  STAR_3: 14,
  STAR_2: 30,
  STAR_1: 45,
  NONE: 60,
};

export type GradeIntervalOption = {
  value: string;
  label: string;
  followUpIntervalDays: number;
};

async function loadIntervalMapForCategory(category: string): Promise<Map<string, number>> {
  const rows = await prisma.configOption.findMany({
    where: { category, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    const days = row.followUpIntervalDays ?? DEFAULT_GRADE_INTERVALS[row.value];
    if (days != null && days > 0) {
      map.set(row.value, days);
    }
  }

  for (const [value, days] of Object.entries(DEFAULT_GRADE_INTERVALS)) {
    if (!map.has(value)) map.set(value, days);
  }

  return map;
}

export async function getCustomerGradeIntervalMap(): Promise<Map<string, number>> {
  return loadIntervalMapForCategory(CONFIG_CATEGORY.CUSTOMER_GRADE);
}

export async function getChannelCustomerGradeIntervalMap(): Promise<Map<string, number>> {
  return loadIntervalMapForCategory(CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE);
}

export async function getGradeIntervalMaps(): Promise<{
  direct: Map<string, number>;
  channel: Map<string, number>;
}> {
  const [direct, channel] = await Promise.all([
    getCustomerGradeIntervalMap(),
    getChannelCustomerGradeIntervalMap(),
  ]);
  return { direct, channel };
}

export function pickGradeIntervalMap(
  customerType: string | null | undefined,
  maps: { direct: Map<string, number>; channel: Map<string, number> }
) {
  return isChannelCustomerType(customerType) ? maps.channel : maps.direct;
}

export async function getCustomerGradeIntervalOptions(): Promise<GradeIntervalOption[]> {
  const rows = await prisma.configOption.findMany({
    where: { category: CONFIG_CATEGORY.CUSTOMER_GRADE },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  if (rows.length === 0) {
    return Object.entries(DEFAULT_GRADE_INTERVALS).map(([value, days]) => ({
      value,
      label: value,
      followUpIntervalDays: days,
    }));
  }

  return rows.map((row) => ({
    value: row.value,
    label: row.label,
    followUpIntervalDays: row.followUpIntervalDays ?? DEFAULT_GRADE_INTERVALS[row.value] ?? 30,
  }));
}

export function resolveGradeIntervalDays(
  grade: string | null | undefined,
  intervalMap: Map<string, number>
): number | null {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) return null;
  return intervalMap.get(normalized) ?? DEFAULT_GRADE_INTERVALS[normalized] ?? null;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function computeGradeFollowUpDueAt(
  lastInteractionAt: Date,
  intervalDays: number
): Date {
  return addDays(lastInteractionAt, intervalDays);
}

/** 即将到期：距截止日 7 天内（含已逾期） */
export const GRADE_EXPIRY_WARNING_DAYS = 7;

export function isWithinGradeExpiryWindow(
  now: Date,
  dueAt: Date,
  warningDays = GRADE_EXPIRY_WARNING_DAYS
): boolean {
  const warningStart = addDays(dueAt, -warningDays);
  return now >= warningStart;
}

export function isGradeFollowUpOverdue(now: Date, dueAt: Date): boolean {
  return now > dueAt;
}
