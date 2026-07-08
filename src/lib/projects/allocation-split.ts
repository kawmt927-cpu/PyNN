import { AllocationMode } from "@prisma/client";
import {
  compareDates,
  countWorkdays,
  eachWorkday,
  isDateInRange,
  maxDate,
  minDate,
  toDateOnly,
} from "./workdays";

export type AllocationRecord = {
  id: string;
  projectId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  allocationMode: AllocationMode;
  plannedDays: number | null;
  splitWeight: number | null;
  dailyRateSnapshot: number;
};

export type PersonDailyLoad = {
  manualShare: number;
  autoShare: number;
  totalShare: number;
  overloaded: boolean;
};

export type PersonLaborSplitRow = {
  allocationId: string;
  projectId: string;
  projectName: string;
  allocationMode: AllocationMode;
  startDate: Date;
  endDate: Date;
  effectiveDays: number;
  cost: number;
  sharePercent: number;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function allocationActiveOn(allocation: AllocationRecord, date: Date): boolean {
  return isDateInRange(date, allocation.startDate, allocation.endDate);
}

function manualDailyShare(allocation: AllocationRecord): number {
  if (allocation.allocationMode !== "MANUAL" || allocation.plannedDays == null) return 0;
  const workdays = countWorkdays(allocation.startDate, allocation.endDate);
  if (workdays === 0) return 0;
  return allocation.plannedDays / workdays;
}

export function getDailyShares(
  userId: string,
  date: Date,
  allAllocations: AllocationRecord[]
): Map<string, number> {
  const shares = new Map<string, number>();
  const active = allAllocations.filter(
    (a) => a.userId === userId && allocationActiveOn(a, date)
  );
  if (active.length === 0) return shares;

  let manualTotal = 0;
  for (const allocation of active) {
    if (allocation.allocationMode === "MANUAL") {
      const daily = manualDailyShare(allocation);
      manualTotal += daily;
      shares.set(allocation.id, daily);
    }
  }

  const autoActive = active.filter((a) => a.allocationMode === "AUTO");
  const remaining = Math.max(0, 1 - manualTotal);

  if (autoActive.length > 0 && remaining > 0) {
    const totalWeight = autoActive.reduce((sum, a) => sum + (a.splitWeight ?? 1), 0);
    for (const allocation of autoActive) {
      const weight = allocation.splitWeight ?? 1;
      shares.set(allocation.id, (remaining * weight) / totalWeight);
    }
  }

  return shares;
}

export function getPersonDailyLoad(
  userId: string,
  date: Date,
  allAllocations: AllocationRecord[]
): PersonDailyLoad {
  const shares = getDailyShares(userId, date, allAllocations);
  let manualShare = 0;
  let autoShare = 0;

  for (const allocation of allAllocations) {
    if (allocation.userId !== userId || !allocationActiveOn(allocation, date)) continue;
    const share = shares.get(allocation.id) ?? 0;
    if (allocation.allocationMode === "MANUAL") manualShare += share;
    else autoShare += share;
  }

  const totalShare = round4(manualShare + autoShare);
  return {
    manualShare: round4(manualShare),
    autoShare: round4(autoShare),
    totalShare,
    overloaded: totalShare > 1.0001,
  };
}

export function computeEffectiveDays(
  allocation: AllocationRecord,
  allUserAllocations: AllocationRecord[],
  dateRange?: { from: Date; to: Date }
): number {
  const rangeStart = maxDate(dateRange?.from ?? allocation.startDate, allocation.startDate);
  const rangeEnd = minDate(dateRange?.to ?? allocation.endDate, allocation.endDate);
  if (compareDates(rangeStart, rangeEnd) > 0) return 0;

  let total = 0;
  for (const day of eachWorkday(rangeStart, rangeEnd)) {
    const shares = getDailyShares(allocation.userId, day, allUserAllocations);
    total += shares.get(allocation.id) ?? 0;
  }
  return round4(total);
}

export function computeAllocationCost(
  allocation: AllocationRecord,
  allUserAllocations: AllocationRecord[],
  dateRange?: { from: Date; to: Date }
): number {
  const days = computeEffectiveDays(allocation, allUserAllocations, dateRange);
  return round2(days * allocation.dailyRateSnapshot);
}

export function serializeAllocationRecord(raw: {
  id: string;
  projectId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  allocationMode: AllocationMode;
  plannedDays: { toNumber?: () => number } | number | null;
  splitWeight: { toNumber?: () => number } | number | null;
  dailyRateSnapshot: { toNumber?: () => number } | number;
}): AllocationRecord {
  const toNum = (v: { toNumber?: () => number } | number | null) => {
    if (v == null) return null;
    return typeof v === "number" ? v : Number(v);
  };
  return {
    id: raw.id,
    projectId: raw.projectId,
    userId: raw.userId,
    startDate: toDateOnly(raw.startDate),
    endDate: toDateOnly(raw.endDate),
    allocationMode: raw.allocationMode,
    plannedDays: toNum(raw.plannedDays),
    splitWeight: toNum(raw.splitWeight),
    dailyRateSnapshot: Number(raw.dailyRateSnapshot),
  };
}

export function buildPersonLaborSplit(
  userId: string,
  allocations: Array<AllocationRecord & { projectName: string }>,
  dateRange?: { from: Date; to: Date }
): PersonLaborSplitRow[] {
  const userAllocations = allocations.filter((a) => a.userId === userId);
  const rows = userAllocations.map((allocation) => {
    const effectiveDays = computeEffectiveDays(allocation, userAllocations, dateRange);
    const cost = round2(effectiveDays * allocation.dailyRateSnapshot);
    return {
      allocationId: allocation.id,
      projectId: allocation.projectId,
      projectName: allocation.projectName,
      allocationMode: allocation.allocationMode,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      effectiveDays,
      cost,
      sharePercent: 0,
    };
  });

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  return rows.map((row) => ({
    ...row,
    sharePercent: totalCost > 0 ? round2((row.cost / totalCost) * 100) : 0,
  }));
}
