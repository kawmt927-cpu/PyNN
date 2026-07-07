import { prisma } from "@/lib/prisma";
import { sumContractPaymentsForOwner } from "@/lib/contracts/payment-actuals";
import { signedContractStatusFilter } from "@/lib/contracts/access";

export type SalesMetrics = {
  sales: number;
  cost: number;
  profit: number;
  payment: number;
};

export type CostBreakdown = {
  projectCost: number;
  dailyBusinessCost: number;
};

export type TargetMetricsBundle = {
  year: number;
  month: number;
  annual: {
    target: SalesMetrics | null;
    actual: SalesMetrics;
    costBreakdown: CostBreakdown;
  };
  monthly: {
    target: SalesMetrics | null;
    actual: SalesMetrics;
    costBreakdown: CostBreakdown;
  };
};

function periodRange(year: number, month?: number) {
  if (month) {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 1),
    };
  }
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
}

const signedContractWhere = (userId: string, start: Date, end: Date) => ({
  ownerId: userId,
  signedAt: { gte: start, lt: end },
  ...signedContractStatusFilter(),
});

async function computeSalesAmount(userId: string, start: Date, end: Date): Promise<number> {
  const rows = await prisma.contract.aggregate({
    where: signedContractWhere(userId, start, end),
    _sum: { totalAmount: true },
  });
  return Number(rows._sum.totalAmount ?? 0);
}

async function computePaymentAmount(userId: string, start: Date, end: Date): Promise<number> {
  return sumContractPaymentsForOwner(userId, start, end);
}

async function computeProjectCostAmount(userId: string, start: Date, end: Date): Promise<number> {
  const products = await prisma.contractProduct.findMany({
    where: { contract: signedContractWhere(userId, start, end) },
    select: { costAmount: true, actualCostPrice: true, costAdjustment: true },
  });

  return products.reduce(
    (sum, row) =>
      sum +
      Number(row.costAmount || row.actualCostPrice) +
      Number(row.costAdjustment ?? 0),
    0
  );
}

async function computeDailyBusinessCostAmount(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const salesCosts = await prisma.salesCost.aggregate({
    where: {
      salesUserId: userId,
      costDate: { gte: start, lt: end },
    },
    _sum: { totalAmount: true },
  });
  return Number(salesCosts._sum.totalAmount ?? 0);
}

async function computeCostBreakdown(
  userId: string,
  start: Date,
  end: Date
): Promise<CostBreakdown> {
  const [projectCost, dailyBusinessCost] = await Promise.all([
    computeProjectCostAmount(userId, start, end),
    computeDailyBusinessCostAmount(userId, start, end),
  ]);
  return { projectCost, dailyBusinessCost };
}

async function computeProfitAmount(userId: string, start: Date, end: Date): Promise<number> {
  const contracts = await prisma.contract.findMany({
    where: signedContractWhere(userId, start, end),
    select: {
      totalAmount: true,
      products: { select: { costAmount: true, actualCostPrice: true, costAdjustment: true } },
    },
  });
  const contractProfit = contracts.reduce((sum, contract) => {
    const productCost = contract.products.reduce(
      (s, row) =>
        s +
        Number(row.costAmount || row.actualCostPrice) +
        Number(row.costAdjustment ?? 0),
      0
    );
    return sum + Number(contract.totalAmount) - productCost;
  }, 0);

  const dailyBusinessCost = await computeDailyBusinessCostAmount(userId, start, end);

  return contractProfit - dailyBusinessCost;
}

async function computeActuals(
  userId: string,
  year: number,
  month?: number
): Promise<{ metrics: SalesMetrics; costBreakdown: CostBreakdown }> {
  const { start, end } = periodRange(year, month);
  const [sales, costBreakdown, profit, payment] = await Promise.all([
    computeSalesAmount(userId, start, end),
    computeCostBreakdown(userId, start, end),
    computeProfitAmount(userId, start, end),
    computePaymentAmount(userId, start, end),
  ]);
  return {
    metrics: {
      sales,
      cost: costBreakdown.projectCost + costBreakdown.dailyBusinessCost,
      profit,
      payment,
    },
    costBreakdown,
  };
}

function toSalesMetrics(row: {
  salesTarget: { toString(): string };
  costTarget: { toString(): string };
  profitTarget: { toString(): string };
  paymentTarget: { toString(): string };
}): SalesMetrics {
  return {
    sales: Number(row.salesTarget),
    cost: Number(row.costTarget),
    profit: Number(row.profitTarget),
    payment: Number(row.paymentTarget),
  };
}

export async function getTargetMetricsBundle(
  userId: string,
  year: number,
  month: number
): Promise<TargetMetricsBundle> {
  const [annualTarget, monthlyTarget, annualActual, monthlyActual] = await Promise.all([
    prisma.salesTarget.findUnique({ where: { userId_year: { userId, year } } }),
    prisma.salesMonthlyTarget.findUnique({
      where: { userId_year_month: { userId, year, month } },
    }),
    computeActuals(userId, year),
    computeActuals(userId, year, month),
  ]);

  return {
    year,
    month,
    annual: {
      target: annualTarget ? toSalesMetrics(annualTarget) : null,
      actual: annualActual.metrics,
      costBreakdown: annualActual.costBreakdown,
    },
    monthly: {
      target: monthlyTarget ? toSalesMetrics(monthlyTarget) : null,
      actual: monthlyActual.metrics,
      costBreakdown: monthlyActual.costBreakdown,
    },
  };
}

export function sumCostBreakdown(rows: CostBreakdown[]): CostBreakdown {
  return rows.reduce(
    (acc, row) => ({
      projectCost: acc.projectCost + row.projectCost,
      dailyBusinessCost: acc.dailyBusinessCost + row.dailyBusinessCost,
    }),
    { projectCost: 0, dailyBusinessCost: 0 }
  );
}

export function sumSalesMetrics(rows: SalesMetrics[]): SalesMetrics {
  return rows.reduce(
    (acc, row) => ({
      sales: acc.sales + row.sales,
      cost: acc.cost + row.cost,
      profit: acc.profit + row.profit,
      payment: acc.payment + row.payment,
    }),
    { sales: 0, cost: 0, profit: 0, payment: 0 }
  );
}

/** 销售管理：汇总全员年度实际与考核目标（个人目标累加） */
export async function getTeamAnnualMetrics(
  userIds: string[],
  year: number
): Promise<{ target: SalesMetrics | null; actual: SalesMetrics; costBreakdown: CostBreakdown }> {
  if (userIds.length === 0) {
    return {
      target: null,
      actual: { sales: 0, cost: 0, profit: 0, payment: 0 },
      costBreakdown: { projectCost: 0, dailyBusinessCost: 0 },
    };
  }

  const bundles = await Promise.all(
    userIds.map(async (userId) => {
      const [targetRow, actual] = await Promise.all([
        prisma.salesTarget.findUnique({ where: { userId_year: { userId, year } } }),
        computeActuals(userId, year),
      ]);
      return {
        target: targetRow ? toSalesMetrics(targetRow) : null,
        actual: actual.metrics,
        costBreakdown: actual.costBreakdown,
      };
    })
  );

  const actual = sumSalesMetrics(bundles.map((item) => item.actual));
  const costBreakdown = sumCostBreakdown(bundles.map((item) => item.costBreakdown));
  const definedTargets = bundles.map((item) => item.target).filter(Boolean) as SalesMetrics[];
  const target = definedTargets.length > 0 ? sumSalesMetrics(definedTargets) : null;

  return { target, actual, costBreakdown };
}

export function toAnnualMetricsBundle(
  year: number,
  month: number,
  annual: { target: SalesMetrics | null; actual: SalesMetrics; costBreakdown: CostBreakdown }
): TargetMetricsBundle {
  return {
    year,
    month,
    annual,
    monthly: {
      target: null,
      actual: { sales: 0, cost: 0, profit: 0, payment: 0 },
      costBreakdown: { projectCost: 0, dailyBusinessCost: 0 },
    },
  };
}

export function formatMetricAmount(value: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function metricProgress(actual: number, target: number | null | undefined): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((actual / target) * 100);
}

export type MetricKey = keyof SalesMetrics;

export const METRIC_DEFINITIONS: {
  key: MetricKey;
  label: string;
  lowerIsBetter?: boolean;
  /** 是否纳入考核目标（否则仅在看板展示实际 KPI） */
  assessment?: boolean;
}[] = [
  { key: "sales", label: "销售额", assessment: true },
  { key: "cost", label: "成本", lowerIsBetter: true, assessment: false },
  { key: "profit", label: "毛利", assessment: true },
  { key: "payment", label: "回款", assessment: true },
];

export function metricAssessmentTarget(
  key: MetricKey,
  target: SalesMetrics | null
): number | null {
  const definition = METRIC_DEFINITIONS.find((item) => item.key === key);
  if (definition?.assessment === false) return null;
  return target?.[key] ?? null;
}

export function metricProgressTone(
  progress: number,
  lowerIsBetter?: boolean
): "good" | "warn" | "bad" {
  if (lowerIsBetter) {
    if (progress <= 100) return "good";
    if (progress <= 120) return "warn";
    return "bad";
  }
  if (progress >= 100) return "good";
  if (progress >= 60) return "warn";
  return "bad";
}
