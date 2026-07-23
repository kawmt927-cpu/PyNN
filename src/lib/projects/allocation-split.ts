import { AllocationMode } from "@prisma/client";
import {
  compareDates,
  eachCalendarDay,
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
  // plannedDays 在手动模式下表示「单日锁定人天」（如 0.4）
  return Math.max(0, allocation.plannedDays);
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

  // MANUAL：锁定单日人天（可与其他项目叠加；合计超过 1 时超载提示）
  let manualTotal = 0;
  for (const allocation of active) {
    if (allocation.allocationMode === "MANUAL") {
      const share = manualDailyShare(allocation);
      shares.set(allocation.id, share);
      manualTotal += share;
    }
  }

  // AUTO：平分 MANUAL 占用后的剩余容量（1 - manualTotal），按项目权重拆分
  const autoActive = active.filter((a) => a.allocationMode === "AUTO");
  const remaining = Math.max(0, 1 - manualTotal);
  if (autoActive.length > 0 && remaining > 0) {
    // 同一项目多条记录只计一份份额，再均分给该项目各条记录
    const byProject = new Map<string, { weight: number; allocationIds: string[] }>();
    for (const allocation of autoActive) {
      const weight = allocation.splitWeight ?? 1;
      const unit = byProject.get(allocation.projectId) ?? { weight: 0, allocationIds: [] };
      unit.weight = Math.max(unit.weight, weight);
      unit.allocationIds.push(allocation.id);
      byProject.set(allocation.projectId, unit);
    }

    const totalWeight = [...byProject.values()].reduce((sum, unit) => sum + unit.weight, 0);
    for (const unit of byProject.values()) {
      const projectShare = (unit.weight / totalWeight) * remaining;
      const perRecord = projectShare / unit.allocationIds.length;
      for (const id of unit.allocationIds) {
        shares.set(id, perRecord);
      }
    }
  } else if (autoActive.length > 0) {
    for (const allocation of autoActive) {
      shares.set(allocation.id, 0);
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
  for (const day of eachCalendarDay(rangeStart, rangeEnd)) {
    const shares = getDailyShares(allocation.userId, day, allUserAllocations);
    total += shares.get(allocation.id) ?? 0;
  }
  return round4(total);
}

export type AllocationDailySegment = {
  startDate: Date;
  endDate: Date;
  workdays: number;
  dailyShare: number;
  subtotal: number;
};

export function mergePeerRecordsWithAllocation(
  allocation: AllocationRecord,
  peerRecords: AllocationRecord[]
): AllocationRecord[] {
  return [...peerRecords.filter((p) => p.id !== allocation.id), allocation];
}

/** 按连续日历日、相同日份额分段，便于展示计算明细 */
export function buildAllocationDailySegments(
  allocation: AllocationRecord,
  allUserAllocations: AllocationRecord[],
  dateRange?: { from: Date; to: Date }
): AllocationDailySegment[] {
  const rangeStart = maxDate(dateRange?.from ?? allocation.startDate, allocation.startDate);
  const rangeEnd = minDate(dateRange?.to ?? allocation.endDate, allocation.endDate);
  if (compareDates(rangeStart, rangeEnd) > 0) return [];

  const segments: AllocationDailySegment[] = [];
  let current: AllocationDailySegment | null = null;

  for (const day of eachCalendarDay(rangeStart, rangeEnd)) {
    const shares = getDailyShares(allocation.userId, day, allUserAllocations);
    const share = round4(shares.get(allocation.id) ?? 0);

    if (current && current.dailyShare === share) {
      current.endDate = day;
      current.workdays += 1;
      current.subtotal = round4(current.subtotal + share);
    } else {
      if (current) segments.push(current);
      current = {
        startDate: day,
        endDate: day,
        workdays: 1,
        dailyShare: share,
        subtotal: share,
      };
    }
  }
  if (current) segments.push(current);
  return segments;
}

export function computeAllocationCost(
  allocation: AllocationRecord,
  allUserAllocations: AllocationRecord[],
  dateRange?: { from: Date; to: Date },
  resolveDailyRate?: (userId: string, date: Date) => number
): number {
  const rangeStart = maxDate(dateRange?.from ?? allocation.startDate, allocation.startDate);
  const rangeEnd = minDate(dateRange?.to ?? allocation.endDate, allocation.endDate);
  if (compareDates(rangeStart, rangeEnd) > 0) return 0;

  if (!resolveDailyRate) {
    const days = computeEffectiveDays(allocation, allUserAllocations, dateRange);
    return round2(days * allocation.dailyRateSnapshot);
  }

  let cost = 0;
  for (const day of eachCalendarDay(rangeStart, rangeEnd)) {
    const shares = getDailyShares(allocation.userId, day, allUserAllocations);
    const share = shares.get(allocation.id) ?? 0;
    if (share <= 0) continue;
    cost += share * resolveDailyRate(allocation.userId, day);
  }
  return round2(cost);
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
  dateRange?: { from: Date; to: Date },
  resolveDailyRate?: (userId: string, date: Date) => number
): PersonLaborSplitRow[] {
  const userAllocations = allocations.filter((a) => a.userId === userId);
  const rows = userAllocations.map((allocation) => {
    const effectiveDays = computeEffectiveDays(allocation, userAllocations, dateRange);
    const cost = computeAllocationCost(
      allocation,
      userAllocations,
      dateRange,
      resolveDailyRate
    );
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
