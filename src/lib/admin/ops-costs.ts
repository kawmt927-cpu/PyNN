import { SIGNED_CONTRACT_STATUSES } from "@/lib/contracts/access";
import { prisma } from "@/lib/prisma";
import { loadDailyRateResolver } from "@/lib/personnel/load-daily-rate-resolver";
import {
  computeAllocationCost,
  serializeAllocationRecord,
} from "@/lib/projects/allocation-split";
import { loadUserAllocations } from "@/lib/projects/cost-summary";

export type OpsCostBucketKey = "external" | "labor" | "other" | "deposit";

export type OpsCostBucket = {
  key: OpsCostBucketKey;
  label: string;
  amount: number;
  hint: string;
};

export type OpsCostSummary = {
  totalAmount: number;
  buckets: OpsCostBucket[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function productCostAmount(row: {
  costAmount?: number | { toString(): string } | null;
  actualCostPrice?: number | { toString(): string } | null;
}) {
  return Number(row.costAmount || row.actualCostPrice || 0);
}

/**
 * 区间内公司总成本：外部项目 / 人力 / 其他 / 保证金。
 * 保证金按支出日全额计入，收回不冲回。
 */
export async function getOpsCostSummary(period: {
  from: Date;
  to: Date;
}): Promise<OpsCostSummary> {
  const { from, to } = period;

  const [externalProducts, projectCostAgg, salesCostAgg, laborAmount, depositAgg] =
    await Promise.all([
      prisma.contractProduct.findMany({
        where: {
          voidedAt: null,
          costType: "EXTERNAL",
          contract: {
            status: { in: [...SIGNED_CONTRACT_STATUSES] },
            signedAt: { gte: from, lte: to },
          },
        },
        select: {
          costAmount: true,
          actualCostPrice: true,
        },
      }),
      prisma.projectCost.aggregate({
        where: { costDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.salesCost.aggregate({
        where: { costDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      sumCompanyLaborCost(from, to),
      prisma.contractDeposit.aggregate({
        where: {
          paidOutAt: { gte: from, lte: to },
          contract: { status: { in: [...SIGNED_CONTRACT_STATUSES] } },
        },
        _sum: { amount: true },
      }),
    ]);

  const external = externalProducts.reduce((sum, row) => sum + productCostAmount(row), 0);
  const other =
    Number(projectCostAgg._sum.amount ?? 0) + Number(salesCostAgg._sum.totalAmount ?? 0);
  const deposit = Number(depositAgg._sum.amount ?? 0);

  const buckets: OpsCostBucket[] = [
    {
      key: "external",
      label: "外部项目成本",
      amount: round2(external),
      hint: "区间内已签合同 · 未作废外部成本（过单/接口/分包等）",
    },
    {
      key: "labor",
      label: "人力成本",
      amount: round2(laborAmount),
      hint: "行政确认当月成本后，按排班在区间内核算（含内部实施）",
    },
    {
      key: "other",
      label: "其他",
      amount: round2(other),
      hint: "区间内项目费用 + 销售费用（含报销入账）",
    },
    {
      key: "deposit",
      label: "保证金",
      amount: round2(deposit),
      hint: "按支出日计入；收回不冲回",
    },
  ];

  const totalAmount = round2(buckets.reduce((sum, row) => sum + row.amount, 0));
  return { totalAmount, buckets };
}

async function sumCompanyLaborCost(from: Date, to: Date) {
  const allocations = await prisma.projectStaffAllocation.findMany({
    where: {
      startDate: { lte: to },
      endDate: { gte: from },
    },
  });
  if (allocations.length === 0) return 0;

  const userIds = [...new Set(allocations.map((row) => row.userId))];
  const [allUserAllocations, resolveDailyRate] = await Promise.all([
    loadUserAllocations(userIds),
    loadDailyRateResolver(userIds),
  ]);

  let total = 0;
  for (const row of allocations) {
    total += computeAllocationCost(
      serializeAllocationRecord(row),
      allUserAllocations,
      { from, to },
      resolveDailyRate
    );
  }
  return round2(total);
}
