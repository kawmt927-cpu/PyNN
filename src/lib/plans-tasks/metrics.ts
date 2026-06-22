import { prisma } from "@/lib/prisma";
import { sumContractPaymentsForOwner } from "@/lib/contracts/payment-actuals";
import { signedContractStatusFilter } from "@/lib/contracts/access";

export type SalesMetrics = {
  sales: number;
  cost: number;
  profit: number;
  payment: number;
};

export type TargetMetricsBundle = {
  year: number;
  month: number;
  annual: {
    target: SalesMetrics | null;
    actual: SalesMetrics;
  };
  monthly: {
    target: SalesMetrics | null;
    actual: SalesMetrics;
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

async function computeCostAmount(userId: string, start: Date, end: Date): Promise<number> {
  const [products, salesCosts] = await Promise.all([
    prisma.contractProduct.findMany({
      where: { contract: signedContractWhere(userId, start, end) },
      select: { costAmount: true, actualCostPrice: true },
    }),
    prisma.salesCost.aggregate({
      where: {
        salesUserId: userId,
        costDate: { gte: start, lt: end },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  const productCost = products.reduce(
    (sum, row) => sum + Number(row.costAmount || row.actualCostPrice),
    0
  );
  return productCost + Number(salesCosts._sum.totalAmount ?? 0);
}

async function computeProfitAmount(userId: string, start: Date, end: Date): Promise<number> {
  const contracts = await prisma.contract.findMany({
    where: signedContractWhere(userId, start, end),
    select: {
      totalAmount: true,
      products: { select: { costAmount: true, actualCostPrice: true } },
    },
  });
  const contractProfit = contracts.reduce((sum, contract) => {
    const productCost = contract.products.reduce(
      (s, row) => s + Number(row.costAmount || row.actualCostPrice),
      0
    );
    return sum + Number(contract.totalAmount) - productCost;
  }, 0);

  const costs = await prisma.salesCost.aggregate({
    where: {
      salesUserId: userId,
      costDate: { gte: start, lt: end },
    },
    _sum: { totalAmount: true },
  });

  return contractProfit - Number(costs._sum.totalAmount ?? 0);
}

async function computeActuals(userId: string, year: number, month?: number): Promise<SalesMetrics> {
  const { start, end } = periodRange(year, month);
  const [sales, cost, profit, payment] = await Promise.all([
    computeSalesAmount(userId, start, end),
    computeCostAmount(userId, start, end),
    computeProfitAmount(userId, start, end),
    computePaymentAmount(userId, start, end),
  ]);
  return { sales, cost, profit, payment };
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
      actual: annualActual,
    },
    monthly: {
      target: monthlyTarget ? toSalesMetrics(monthlyTarget) : null,
      actual: monthlyActual,
    },
  };
}

export function formatMetricAmount(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)} 万`;
  }
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function metricProgress(actual: number, target: number | null | undefined): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((actual / target) * 100);
}

export type MetricKey = keyof SalesMetrics;

export const METRIC_DEFINITIONS: { key: MetricKey; label: string; lowerIsBetter?: boolean }[] = [
  { key: "sales", label: "销售额" },
  { key: "cost", label: "成本", lowerIsBetter: true },
  { key: "profit", label: "毛利" },
  { key: "payment", label: "回款" },
];

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
