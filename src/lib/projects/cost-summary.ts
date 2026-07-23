import { prisma } from "@/lib/prisma";
import { loadDailyRateResolver } from "@/lib/personnel/load-daily-rate-resolver";
import {
  AllocationRecord,
  buildPersonLaborSplit,
  computeAllocationCost,
  computeEffectiveDays,
  serializeAllocationRecord,
} from "./allocation-split";

export type ProjectLaborLine = {
  allocationId: string;
  userId: string;
  userName: string;
  allocationMode: string;
  effectiveDays: number;
  dailyRateSnapshot: number;
  cost: number;
};

export type ProjectCostSummary = {
  laborCost: number;
  expenseCost: number;
  actualCost: number;
  contractAmount: number | null;
  laborLines: ProjectLaborLine[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function loadUserAllocations(userIds: string[]): Promise<AllocationRecord[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.projectStaffAllocation.findMany({
    where: { userId: { in: userIds } },
  });
  return rows.map(serializeAllocationRecord);
}

export function summarizeProjectLabor(
  projectId: string,
  allocations: Array<AllocationRecord & { userName: string }>,
  allUserAllocations: AllocationRecord[],
  dateRange?: { from: Date; to: Date },
  resolveDailyRate?: (userId: string, date: Date) => number
): { laborCost: number; laborLines: ProjectLaborLine[] } {
  const projectAllocations = allocations.filter((a) => a.projectId === projectId);
  const laborLines: ProjectLaborLine[] = projectAllocations.map((allocation) => {
    const effectiveDays = computeEffectiveDays(allocation, allUserAllocations, dateRange);
    const cost = computeAllocationCost(
      allocation,
      allUserAllocations,
      dateRange,
      resolveDailyRate
    );
    const avgDailyRate =
      effectiveDays > 0 ? round2(cost / effectiveDays) : allocation.dailyRateSnapshot;
    return {
      allocationId: allocation.id,
      userId: allocation.userId,
      userName: allocation.userName,
      allocationMode: allocation.allocationMode,
      effectiveDays,
      dailyRateSnapshot: avgDailyRate,
      cost,
    };
  });
  const laborCost = round2(laborLines.reduce((sum, line) => sum + line.cost, 0));
  return { laborCost, laborLines };
}

export async function getProjectCostSummary(
  projectId: string,
  dateRange?: { from: Date; to: Date }
): Promise<ProjectCostSummary> {
  const [project, expenseAgg, allocations] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { contract: { select: { totalAmount: true } } },
    }),
    prisma.projectCost.aggregate({
      where: { projectId },
      _sum: { amount: true },
    }),
    prisma.projectStaffAllocation.findMany({
      where: { projectId },
      include: { user: { select: { name: true } } },
    }),
  ]);

  if (!project) throw new Error("项目不存在");

  const userIds = [...new Set(allocations.map((a) => a.userId))];
  const [allUserAllocations, resolveDailyRate] = await Promise.all([
    loadUserAllocations(userIds),
    loadDailyRateResolver(userIds),
  ]);

  const enriched = allocations.map((row) => ({
    ...serializeAllocationRecord(row),
    userName: row.user.name,
  }));

  const { laborCost, laborLines } = summarizeProjectLabor(
    projectId,
    enriched,
    allUserAllocations,
    dateRange,
    resolveDailyRate
  );

  const expenseCost = round2(Number(expenseAgg._sum.amount ?? 0));

  return {
    laborCost,
    expenseCost,
    actualCost: round2(laborCost + expenseCost),
    contractAmount: project.contract?.totalAmount
      ? Number(project.contract.totalAmount)
      : null,
    laborLines,
  };
}

export async function getPersonAllocationSplit(
  userId: string,
  dateRange?: { from: Date; to: Date }
) {
  const rows = await prisma.projectStaffAllocation.findMany({
    where: { userId },
    include: { project: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });

  const userAllocations = rows.map((row) => ({
    ...serializeAllocationRecord(row),
    projectName: row.project.name,
  }));

  const resolveDailyRate = await loadDailyRateResolver([userId]);
  const split = buildPersonLaborSplit(userId, userAllocations, dateRange, resolveDailyRate);
  const totalCost = round2(split.reduce((sum, row) => sum + row.cost, 0));
  const totalDays = round2(split.reduce((sum, row) => sum + row.effectiveDays, 0));

  return { split, totalCost, totalDays };
}

export type ProjectListRow = {
  id: string;
  name: string;
  status: string;
  progressPercent: number;
  customerName: string;
  managerName: string | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  actualCost: number;
  contractAmount: number | null;
};

export async function attachCostsToProjectList(
  projects: Array<{
    id: string;
    name: string;
    status: string;
    progressPercent: number;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    customer: { name: string } | null;
    projectManager: { name: string } | null;
    contract: { totalAmount: { toNumber?: () => number } | number } | null;
  }>
): Promise<ProjectListRow[]> {
  return Promise.all(
    projects.map(async (project) => {
      const summary = await getProjectCostSummary(project.id);
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        progressPercent: project.progressPercent,
        customerName: project.customer?.name ?? "内部项目",
        managerName: project.projectManager?.name ?? null,
        plannedStartAt: project.plannedStartAt,
        plannedEndAt: project.plannedEndAt,
        actualCost: summary.actualCost,
        contractAmount: project.contract?.totalAmount
          ? Number(project.contract.totalAmount)
          : null,
      };
    })
  );
}
