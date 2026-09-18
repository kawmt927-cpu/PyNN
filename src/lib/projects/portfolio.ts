import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getPersonDailyLoad,
  serializeAllocationRecord,
  type AllocationRecord,
} from "@/lib/projects/allocation-split";
import { eachCalendarDay, toDateOnly } from "@/lib/projects/workdays";

/** 组合看板默认纳入的「在途」状态（不含已关闭） */
export const PORTFOLIO_ACTIVE_STATUSES: ProjectStatus[] = [
  "PENDING_START",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
];

export type PortfolioFilters = {
  status: ProjectStatus | "";
  overdueOnly: boolean;
  managerId: string;
};

export type PortfolioRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  plannedEndAt: Date | null;
  overdue: boolean;
  progressPercent: number;
  riskMemoCount: number;
  managerId: string | null;
  managerName: string | null;
  hasResourceConflict: boolean;
};

export type PortfolioManagerOption = {
  id: string;
  name: string;
};

function parseStatus(raw: string | undefined): ProjectStatus | "" {
  if (!raw) return "";
  return (PORTFOLIO_ACTIVE_STATUSES as string[]).includes(raw)
    ? (raw as ProjectStatus)
    : "";
}

export function parsePortfolioFilters(params: {
  status?: string;
  overdue?: string;
  managerId?: string;
}): PortfolioFilters {
  return {
    status: parseStatus(params.status),
    overdueOnly: params.overdue === "1" || params.overdue === "true",
    managerId: params.managerId?.trim() || "",
  };
}

export function buildPortfolioHref(filters: PortfolioFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.overdueOnly) params.set("overdue", "1");
  if (filters.managerId) params.set("managerId", filters.managerId);
  const qs = params.toString();
  return qs ? `/projects/portfolio?${qs}` : "/projects/portfolio";
}

/**
 * 同一人同一天份额合计 > 1 的项目打资源冲突标记。
 * 需载入相关人员的全部排班记录，才能正确计算跨项目 AUTO/MANUAL 份额。
 */
export function findResourceConflictProjectIds(
  projectIds: Set<string>,
  allUserAllocations: AllocationRecord[]
): Set<string> {
  const conflicted = new Set<string>();
  if (projectIds.size === 0 || allUserAllocations.length === 0) return conflicted;

  const byUser = new Map<string, AllocationRecord[]>();
  for (const row of allUserAllocations) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  const today = toDateOnly(new Date());

  for (const [userId, records] of byUser) {
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    for (const row of records) {
      const start = toDateOnly(row.startDate);
      const end = toDateOnly(row.endDate);
      if (!rangeStart || start < rangeStart) rangeStart = start;
      if (!rangeEnd || end > rangeEnd) rangeEnd = end;
    }
    if (!rangeStart || !rangeEnd) continue;
    // 只扫「今天起」到最远结束日，避免历史超载刷屏；已结束分段仍用其区间
    const scanFrom = rangeStart < today ? today : rangeStart;
    if (scanFrom > rangeEnd) continue;

    for (const day of eachCalendarDay(scanFrom, rangeEnd)) {
      const load = getPersonDailyLoad(userId, day, records);
      if (!load.overloaded) continue;
      for (const row of records) {
        if (!projectIds.has(row.projectId)) continue;
        const start = toDateOnly(row.startDate);
        const end = toDateOnly(row.endDate);
        if (day >= start && day <= end) {
          conflicted.add(row.projectId);
        }
      }
    }
  }

  return conflicted;
}

export async function getPortfolioBoard(
  filters: PortfolioFilters
): Promise<{ rows: PortfolioRow[]; managers: PortfolioManagerOption[] }> {
  const statusFilter = filters.status
    ? [filters.status]
    : PORTFOLIO_ACTIVE_STATUSES;

  const projects = await prisma.project.findMany({
    where: {
      status: { in: statusFilter },
      ...(filters.managerId ? { projectManagerId: filters.managerId } : {}),
    },
    orderBy: [{ plannedEndAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      plannedEndAt: true,
      progressPercent: true,
      projectManagerId: true,
      projectManager: { select: { id: true, name: true } },
      _count: {
        select: { memos: { where: { isRisk: true } } },
      },
    },
    take: 500,
  });

  const today = toDateOnly(new Date());
  const projectIds = new Set(projects.map((p) => p.id));

  const allocationsOnBoard = await prisma.projectStaffAllocation.findMany({
    where: { projectId: { in: [...projectIds] } },
    select: { userId: true },
  });
  const userIds = [...new Set(allocationsOnBoard.map((a) => a.userId))];

  let conflictedIds = new Set<string>();
  if (userIds.length > 0) {
    const allRows = await prisma.projectStaffAllocation.findMany({
      where: { userId: { in: userIds } },
    });
    conflictedIds = findResourceConflictProjectIds(
      projectIds,
      allRows.map(serializeAllocationRecord)
    );
  }

  let rows: PortfolioRow[] = projects.map((p) => {
    const plannedEndAt = p.plannedEndAt;
    const overdue = Boolean(
      plannedEndAt && toDateOnly(plannedEndAt) < today && p.status !== "CLOSED"
    );
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      plannedEndAt,
      overdue,
      progressPercent: p.progressPercent,
      riskMemoCount: p._count.memos,
      managerId: p.projectManagerId,
      managerName: p.projectManager?.name ?? null,
      hasResourceConflict: conflictedIds.has(p.id),
    };
  });

  if (filters.overdueOnly) {
    rows = rows.filter((r) => r.overdue);
  }

  const managerMap = new Map<string, string>();
  for (const p of projects) {
    if (p.projectManagerId && p.projectManager) {
      managerMap.set(p.projectManagerId, p.projectManager.name);
    }
  }
  // 经理下拉用未按经理筛选前的全量在途项目经理列表
  const allManagers =
    filters.managerId || filters.status || filters.overdueOnly
      ? await prisma.project.findMany({
          where: {
            status: { in: PORTFOLIO_ACTIVE_STATUSES },
            projectManagerId: { not: null },
          },
          distinct: ["projectManagerId"],
          select: {
            projectManagerId: true,
            projectManager: { select: { id: true, name: true } },
          },
        })
      : null;

  const managers: PortfolioManagerOption[] = allManagers
    ? allManagers
        .filter((m) => m.projectManagerId && m.projectManager)
        .map((m) => ({
          id: m.projectManager!.id,
          name: m.projectManager!.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    : [...managerMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  return { rows, managers };
}
