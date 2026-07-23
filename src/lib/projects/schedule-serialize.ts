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
import { formatLocalDateInput } from "@/lib/dates/local-date";
import type { SchedulePeriod } from "./timeline";
import { getWeekPeriod, workdaysInPeriod } from "./timeline";
import { trimOverlappingProjectAllocations } from "./allocation-dedup";
import { loadDailyRateResolver } from "@/lib/personnel/load-daily-rate-resolver";

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

const DRAFT_BAR_ID_PREFIX = "draft-";

export function isDraftScheduleBarId(id: string): boolean {
  return id.startsWith(DRAFT_BAR_ID_PREFIX);
}

export function buildDraftScheduleBar(input: {
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  dailyRate: number | null;
}): ScheduleBar {
  return {
    id: `${DRAFT_BAR_ID_PREFIX}${input.userId}-${input.projectId}`,
    userId: input.userId,
    userName: input.userName,
    projectId: input.projectId,
    projectName: input.projectName,
    startDate: input.startDate,
    endDate: input.endDate,
    allocationMode: "AUTO",
    plannedDays: null,
    effectiveDays: 0,
    dailyRateSnapshot: input.dailyRate ?? 0,
    cost: 0,
    notes: null,
  };
}

export type ScheduleStaff = {
  id: string;
  name: string;
  dailyRate: number | null;
  personnelType: string | null;
  weekEffectiveDays: number;
  parallelProjects: number;
  weekLoadPercent: number;
};

export type ScheduleProjectStaff = {
  userId: string;
  name: string;
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
  actualStartAt: string | null;
  actualEndAt: string | null;
  periodEffectiveDays: number;
  periodStaffCount: number;
  periodCost: number;
  periodStaff: ScheduleProjectStaff[];
};

export type ScheduleModuleData = {
  period: {
    mode: import("./timeline").ScheduleRangeMode;
    from: string;
    to: string;
  };
  staff: ScheduleStaff[];
  projects: ScheduleProjectOption[];
  /** 当前周期内可见的投入条（用于甘特展示） */
  allBars: ScheduleBar[];
  /**
   * 周期内出现过的「项目+人员」的全部分段（含周期外），
   * 供编辑弹窗做重叠校验与新增分段默认日期，避免漏检。
   */
  allocationSegments: ScheduleBar[];
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
  const [allByUser, resolveDailyRate] = await Promise.all([
    Promise.all(
      userIds.map(async (userId) => {
        const list = await prisma.projectStaffAllocation.findMany({
          where: { userId },
        });
        return { userId, records: list.map(serializeAllocationRecord) };
      })
    ),
    loadDailyRateResolver(userIds),
  ]);
  const recordMap = new Map<string, AllocationRecord[]>(
    allByUser.map(({ userId, records }) => [userId, records])
  );

  return rows.map((row) => {
    const record = serializeAllocationRecord(row);
    const userRecords = recordMap.get(row.userId) ?? [record];
    const effectiveDays = computeEffectiveDays(record, userRecords, weekRange);
    const cost = computeAllocationCost(record, userRecords, weekRange, resolveDailyRate);
    const avgDailyRate =
      effectiveDays > 0 ? Math.round((cost / effectiveDays) * 100) / 100 : resolveDailyRate(row.userId, weekRange.from);
    return {
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      projectId: row.projectId,
      projectName: row.project.name,
      startDate: formatLocalDateInput(row.startDate),
      endDate: formatLocalDateInput(row.endDate),
      allocationMode: row.allocationMode,
      plannedDays: record.plannedDays,
      effectiveDays,
      dailyRateSnapshot: avgDailyRate,
      cost,
      notes: row.notes,
    };
  });
}

export async function loadScheduleStaff(period: SchedulePeriod): Promise<ScheduleStaff[]> {
  const range = { from: toDateOnly(period.from), to: toDateOnly(period.to) };
  const capacityDays = workdaysInPeriod(period);
  const periodMid = new Date(
    (range.from.getTime() + range.to.getTime()) / 2
  );

  const users = await prisma.user.findMany({
    where: {
      personnelProfile: { staffCategory: "IMPLEMENTATION", enabled: true },
    },
    select: {
      id: true,
      name: true,
      personnelProfile: {
        select: {
          baseSalary: true,
          socialSecurityCompany: true,
          housingFundCompany: true,
          dailyRate: true,
          personnelType: true,
        },
      },
      staffAllocations: {
        where: overlapRangeWhere(range.from, range.to),
        select: { projectId: true, startDate: true, endDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const userIds = users.map((u) => u.id);
  const resolveDailyRate = await loadDailyRateResolver(userIds);

  const result: ScheduleStaff[] = [];
  for (const user of users) {
    const allRecords = (
      await prisma.projectStaffAllocation.findMany({ where: { userId: user.id } })
    ).map(serializeAllocationRecord);

    let periodEffectiveDays = 0;
    for (const day of eachCalendarDayInRange(range.from, range.to)) {
      const load = getPersonDailyLoad(user.id, day, allRecords);
      periodEffectiveDays += load.totalShare;
    }

    const resolved = resolveDailyRate(user.id, periodMid);
    const dailyRate =
      resolved > 0
        ? resolved
        : user.personnelProfile?.dailyRate != null
          ? Number(user.personnelProfile.dailyRate)
          : null;

    const projectIds = new Set(user.staffAllocations.map((a) => a.projectId));
    result.push({
      id: user.id,
      name: user.name,
      dailyRate,
      personnelType: user.personnelProfile?.personnelType ?? null,
      weekEffectiveDays: round2(periodEffectiveDays),
      parallelProjects: projectIds.size,
      weekLoadPercent:
        capacityDays > 0 ? round2((periodEffectiveDays / capacityDays) * 100) : 0,
    });
  }
  return result;
}

function eachCalendarDayInRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = toDateOnly(from);
  const end = toDateOnly(to);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function getProjectScheduleView(projectId: string, weekStart: Date) {
  await trimOverlappingProjectAllocations();

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
  await trimOverlappingProjectAllocations();

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
        actualStartAt: true,
        actualEndAt: true,
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

  // 编辑弹窗需要同项目同人员的全部分段（含当前周期外），否则会漏检重叠
  const pairKeys = new Map<string, { projectId: string; userId: string }>();
  for (const row of barsRaw) {
    pairKeys.set(`${row.projectId}:${row.userId}`, {
      projectId: row.projectId,
      userId: row.userId,
    });
  }
  const pairs = [...pairKeys.values()];
  const siblingRows =
    pairs.length === 0
      ? []
      : await prisma.projectStaffAllocation.findMany({
          where: {
            OR: pairs.map((pair) => ({
              projectId: pair.projectId,
              userId: pair.userId,
            })),
          },
          include: {
            user: { select: { name: true } },
            project: { select: { name: true } },
          },
          orderBy: [{ startDate: "asc" }],
        });
  const allocationSegments = await enrichBars(siblingRows, range);

  const projectStats = new Map<
    string,
    { effectiveDays: number; cost: number; staff: Map<string, string> }
  >();
  for (const bar of allBars) {
    const stats = projectStats.get(bar.projectId) ?? {
      effectiveDays: 0,
      cost: 0,
      staff: new Map<string, string>(),
    };
    stats.effectiveDays = round2(stats.effectiveDays + bar.effectiveDays);
    stats.cost = round2(stats.cost + bar.cost);
    stats.staff.set(bar.userId, bar.userName);
    projectStats.set(bar.projectId, stats);
  }

  return {
    period: {
      mode: period.mode,
      from: formatLocalDateInput(range.from),
      to: formatLocalDateInput(range.to),
    },
    staff,
    projects: projectsRaw.map((p) => {
      const stats = projectStats.get(p.id);
      return {
        id: p.id,
        name: p.name,
        customerName: p.customer?.name ?? "内部项目",
        status: p.status,
        progressPercent: p.progressPercent,
        projectManagerName: p.projectManager?.name ?? null,
        plannedStartAt: p.plannedStartAt?.toISOString() ?? null,
        plannedEndAt: p.plannedEndAt?.toISOString() ?? null,
        actualStartAt: p.actualStartAt?.toISOString() ?? null,
        actualEndAt: p.actualEndAt?.toISOString() ?? null,
        periodEffectiveDays: stats?.effectiveDays ?? 0,
        periodStaffCount: stats?.staff.size ?? 0,
        periodCost: stats?.cost ?? 0,
        periodStaff: [...(stats?.staff.entries() ?? [])]
          .map(([userId, name]) => ({ userId, name }))
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      };
    }),
    allBars,
    allocationSegments,
    globalRows: buildGlobalRows(allBars, capacityDays),
  };
}
