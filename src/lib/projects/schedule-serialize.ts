import { AllocationMode, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProjectListWhere } from "./access";
import {
  computeAllocationCost,
  computeEffectiveDays,
  getPersonDailyLoad,
  serializeAllocationRecord,
  type AllocationRecord,
} from "./allocation-split";
import { getWeekRange } from "./week-range";
import { toDateOnly } from "./workdays";
import { addDays } from "date-fns";
import type { SchedulePeriod } from "./timeline";
import { getWeekPeriod, workdaysInPeriod } from "./timeline";

export type ScheduleBar = {
  id: string;
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  allocationMode: AllocationMode;
  plannedDays: number | null;
  effectiveDays: number;
  dailyRateSnapshot: number;
  cost: number;
  notes: string | null;
};

export type ScheduleStaff = {
  id: string;
  name: string;
  dailyRate: number | null;
  personnelType: string | null;
  weekEffectiveDays: number;
  parallelProjects: number;
  weekLoadPercent: number;
};

export type ScheduleProjectOption = {
  id: string;
  name: string;
  customerName: string;
  status: import("@prisma/client").ProjectStatus;
  progressPercent: number;
  projectManagerName: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  periodEffectiveDays: number;
  periodStaffCount: number;
  periodCost: number;
};

export type ScheduleModuleData = {
  period: {
    mode: import("./timeline").ScheduleRangeMode;
    from: string;
    to: string;
  };
  staff: ScheduleStaff[];
  projects: ScheduleProjectOption[];
  allBars: ScheduleBar[];
  globalRows: SchedulePersonRow[];
};

export type SchedulePersonRow = {
  userId: string;
  userName: string;
  weekEffectiveDays: number;
  weekCost: number;
  weekLoadPercent: number;
  bars: ScheduleBar[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function overlapRangeWhere(from: Date, to: Date) {
  return {
    startDate: { lte: toDateOnly(to) },
    endDate: { gte: toDateOnly(from) },
  };
}

/** @deprecated */
function overlapWeekWhere(weekStart: Date) {
  const from = toDateOnly(weekStart);
  return overlapRangeWhere(from, addDays(from, 6));
}

async function enrichBars(
  rows: Array<{
    id: string;
    projectId: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    allocationMode: AllocationMode;
    plannedDays: { toNumber?: () => number } | number | null;
    splitWeight: { toNumber?: () => number } | number | null;
    dailyRateSnapshot: { toNumber?: () => number } | number;
    notes: string | null;
    user: { name: string };
    project: { name: string };
  }>,
  weekRange: { from: Date; to: Date }
): Promise<ScheduleBar[]> {
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const allByUser = await Promise.all(
    userIds.map(async (userId) => {
      const list = await prisma.projectStaffAllocation.findMany({
        where: { userId },
      });
      return { userId, records: list.map(serializeAllocationRecord) };
    })
  );
  const recordMap = new Map<string, AllocationRecord[]>(
    allByUser.map(({ userId, records }) => [userId, records])
  );

  return rows.map((row) => {
    const record = serializeAllocationRecord(row);
    const userRecords = recordMap.get(row.userId) ?? [record];
    return {
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      projectId: row.projectId,
      projectName: row.project.name,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      allocationMode: row.allocationMode,
      plannedDays: record.plannedDays,
      effectiveDays: computeEffectiveDays(record, userRecords, weekRange),
      dailyRateSnapshot: record.dailyRateSnapshot,
      cost: computeAllocationCost(record, userRecords, weekRange),
      notes: row.notes,
    };
  });
}

export async function loadScheduleStaff(period: SchedulePeriod): Promise<ScheduleStaff[]> {
  const range = { from: toDateOnly(period.from), to: toDateOnly(period.to) };
  const capacityDays = workdaysInPeriod(period);

  const users = await prisma.user.findMany({
    where: {
      personnelProfile: { staffCategory: "IMPLEMENTATION", enabled: true },
    },
    select: {
      id: true,
      name: true,
      personnelProfile: { select: { dailyRate: true, personnelType: true } },
      staffAllocations: {
        where: overlapRangeWhere(range.from, range.to),
        select: { projectId: true, startDate: true, endDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const result: ScheduleStaff[] = [];
  for (const user of users) {
    const allRecords = (
      await prisma.projectStaffAllocation.findMany({ where: { userId: user.id } })
    ).map(serializeAllocationRecord);

    let periodEffectiveDays = 0;
    for (const day of eachWorkdayInRange(range.from, range.to)) {
      const load = getPersonDailyLoad(user.id, day, allRecords);
      periodEffectiveDays += load.totalShare;
    }

    const projectIds = new Set(user.staffAllocations.map((a) => a.projectId));
    result.push({
      id: user.id,
      name: user.name,
      dailyRate: user.personnelProfile?.dailyRate
        ? Number(user.personnelProfile.dailyRate)
        : null,
      personnelType: user.personnelProfile?.personnelType ?? null,
      weekEffectiveDays: round2(periodEffectiveDays),
      parallelProjects: projectIds.size,
      weekLoadPercent:
        capacityDays > 0 ? round2((periodEffectiveDays / capacityDays) * 100) : 0,
    });
  }
  return result;
}

function eachWorkdayInRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = toDateOnly(from);
  const end = toDateOnly(to);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function getProjectScheduleView(projectId: string, weekStart: Date) {
  const period = {
    mode: "week" as const,
    from: toDateOnly(weekStart),
    to: addDays(toDateOnly(weekStart), 6),
  };
  const weekRange = { from: period.from, to: period.to };

  const [barsRaw, staff] = await Promise.all([
    prisma.projectStaffAllocation.findMany({
      where: { projectId, ...overlapRangeWhere(period.from, period.to) },
      include: {
        user: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    loadScheduleStaff(period),
  ]);

  const bars = await enrichBars(barsRaw, weekRange);
  return { bars, staff, weekStart: weekRange.from.toISOString() };
}

export async function getGlobalScheduleView(
  role: UserRole,
  userId: string,
  weekStart: Date
) {
  const weekRange = { from: toDateOnly(weekStart), to: addDays(toDateOnly(weekStart), 6) };
  const projectWhere = buildProjectListWhere(role, userId);
  const allocationWhere =
    projectWhere.id === "__none__"
      ? { projectId: "__none__" as string }
      : Object.keys(projectWhere).length > 0
        ? { project: projectWhere }
        : {};

  const barsRaw = await prisma.projectStaffAllocation.findMany({
    where: {
      ...overlapWeekWhere(weekStart),
      ...allocationWhere,
    },
    include: {
      user: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ user: { name: "asc" } }, { startDate: "asc" }],
  });

  const bars = await enrichBars(barsRaw, weekRange);
  const byUser = new Map<string, SchedulePersonRow>();

  for (const bar of bars) {
    const existing = byUser.get(bar.userId);
    if (existing) {
      existing.bars.push(bar);
      existing.weekEffectiveDays = round2(existing.weekEffectiveDays + bar.effectiveDays);
      existing.weekCost = round2(existing.weekCost + bar.cost);
    } else {
      byUser.set(bar.userId, {
        userId: bar.userId,
        userName: bar.userName,
        weekEffectiveDays: bar.effectiveDays,
        weekCost: bar.cost,
        weekLoadPercent: round2((bar.effectiveDays / 5) * 100),
        bars: [bar],
      });
    }
  }

  for (const row of byUser.values()) {
    row.weekLoadPercent = round2((row.weekEffectiveDays / 5) * 100);
  }

  const staff = await loadScheduleStaff(getWeekPeriod(weekStart));
  return {
    rows: [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName)),
    staff,
    weekStart: weekRange.from.toISOString(),
  };
}

export function defaultWeekStart() {
  return getWeekRange().from;
}

export function buildPeerRecordsMap(
  raw: Array<{
    id: string;
    projectId: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    allocationMode: AllocationMode;
    plannedDays: unknown;
    splitWeight: unknown;
    dailyRateSnapshot: unknown;
  }>
): Record<string, AllocationRecord[]> {
  const byUser = new Map<string, AllocationRecord[]>();
  for (const row of raw) {
    const record = serializeAllocationRecord({
      ...row,
      plannedDays: row.plannedDays as never,
      splitWeight: row.splitWeight as never,
      dailyRateSnapshot: row.dailyRateSnapshot as never,
    });
    const list = byUser.get(row.userId) ?? [];
    list.push(record);
    byUser.set(row.userId, list);
  }
  return Object.fromEntries(byUser);
}

function buildGlobalRows(bars: ScheduleBar[], capacityDays: number): SchedulePersonRow[] {
  const byUser = new Map<string, SchedulePersonRow>();
  for (const bar of bars) {
    const existing = byUser.get(bar.userId);
    if (existing) {
      existing.bars.push(bar);
      existing.weekEffectiveDays = round2(existing.weekEffectiveDays + bar.effectiveDays);
      existing.weekCost = round2(existing.weekCost + bar.cost);
    } else {
      byUser.set(bar.userId, {
        userId: bar.userId,
        userName: bar.userName,
        weekEffectiveDays: bar.effectiveDays,
        weekCost: bar.cost,
        weekLoadPercent:
          capacityDays > 0 ? round2((bar.effectiveDays / capacityDays) * 100) : 0,
        bars: [bar],
      });
    }
  }
  for (const row of byUser.values()) {
    row.weekLoadPercent =
      capacityDays > 0 ? round2((row.weekEffectiveDays / capacityDays) * 100) : 0;
  }
  return [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName));
}

export async function getScheduleModuleData(
  role: UserRole,
  userId: string,
  period: SchedulePeriod
): Promise<ScheduleModuleData> {
  const range = { from: toDateOnly(period.from), to: toDateOnly(period.to) };
  const capacityDays = workdaysInPeriod(period);
  const projectWhere = buildProjectListWhere(role, userId);

  const allocationWhere =
    projectWhere.id === "__none__"
      ? { projectId: "__none__" as string }
      : Object.keys(projectWhere).length > 0
        ? { project: projectWhere }
        : {};

  const [staff, projectsRaw, barsRaw] = await Promise.all([
    loadScheduleStaff(period),
    prisma.project.findMany({
      where: projectWhere.id === "__none__" ? { id: "__none__" } : projectWhere,
      select: {
        id: true,
        name: true,
        status: true,
        progressPercent: true,
        plannedStartAt: true,
        plannedEndAt: true,
        customer: { select: { name: true } },
        projectManager: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.projectStaffAllocation.findMany({
      where: {
        ...overlapRangeWhere(range.from, range.to),
        ...allocationWhere,
      },
      include: {
        user: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ project: { name: "asc" } }, { user: { name: "asc" } }],
    }),
  ]);

  const allBars = await enrichBars(barsRaw, range);

  const projectStats = new Map<
    string,
    { effectiveDays: number; cost: number; staffIds: Set<string> }
  >();
  for (const bar of allBars) {
    const stats = projectStats.get(bar.projectId) ?? {
      effectiveDays: 0,
      cost: 0,
      staffIds: new Set<string>(),
    };
    stats.effectiveDays = round2(stats.effectiveDays + bar.effectiveDays);
    stats.cost = round2(stats.cost + bar.cost);
    stats.staffIds.add(bar.userId);
    projectStats.set(bar.projectId, stats);
  }

  return {
    period: {
      mode: period.mode,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    staff,
    projects: projectsRaw.map((p) => {
      const stats = projectStats.get(p.id);
      return {
        id: p.id,
        name: p.name,
        customerName: p.customer.name,
        status: p.status,
        progressPercent: p.progressPercent,
        projectManagerName: p.projectManager?.name ?? null,
        plannedStartAt: p.plannedStartAt?.toISOString() ?? null,
        plannedEndAt: p.plannedEndAt?.toISOString() ?? null,
        periodEffectiveDays: stats?.effectiveDays ?? 0,
        periodStaffCount: stats?.staffIds.size ?? 0,
        periodCost: stats?.cost ?? 0,
      };
    }),
    allBars,
    globalRows: buildGlobalRows(allBars, capacityDays),
  };
}
