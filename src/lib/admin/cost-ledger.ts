import { format } from "date-fns";
import { SIGNED_CONTRACT_STATUSES } from "@/lib/contracts/access";
import { prisma } from "@/lib/prisma";
import {
  computeMonthlyCost,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";
import {
  opsRecentYears,
  resolveOpsPeriod,
  type OpsPeriod,
} from "@/lib/admin/ops-dashboard";

export type CostLedgerBucketKey =
  | "external"
  | "confirmed_labor"
  | "paid_expenses"
  | "sales";

export type CostLedgerDetailRow = {
  bucket: CostLedgerBucketKey;
  id: string;
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  href: string | null;
};

export type CostLedgerBucket = {
  key: CostLedgerBucketKey;
  label: string;
  amount: number;
  hint: string;
  href: string;
  detailCount: number;
};

export type CostLedgerData = {
  period: OpsPeriod;
  totalAmount: number;
  buckets: CostLedgerBucket[];
  details: CostLedgerDetailRow[];
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

function monthsInPeriod(from: Date, to: Date): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    out.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function periodQuery(period: OpsPeriod): string {
  const params = new URLSearchParams();
  if (period.preset === "custom") {
    params.set("from", period.fromMonth);
    params.set("to", period.toMonth);
  } else if (period.year) {
    params.set("year", String(period.year));
  }
  return params.toString();
}

/**
 * 成本台账 v1：外部合同成本 / 已确认人力 / 已打款报销 / 销售费用。
 * 区间口径复用运营看板 resolveOpsPeriod。
 */
export async function getCostLedger(periodInput: {
  year?: string | number | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<CostLedgerData> {
  const period = resolveOpsPeriod(periodInput);
  const { from, to } = period;
  const monthPairs = monthsInPeriod(from, to);
  const yearMonthQs =
    period.preset === "year" && period.year
      ? `year=${period.year}`
      : period.fromMonth === period.toMonth
        ? `year=${period.fromMonth.slice(0, 4)}&month=${Number(period.fromMonth.slice(5))}`
        : `year=${period.fromMonth.slice(0, 4)}`;

  const orMonthClauses = monthPairs.map(({ year, month }) => ({ year, month }));

  const [externalProducts, confirmedCosts, expensePayouts, salesCosts] =
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
          id: true,
          productName: true,
          costAmount: true,
          actualCostPrice: true,
          contract: {
            select: {
              id: true,
              title: true,
              contractNo: true,
              signedAt: true,
              signCustomer: { select: { name: true } },
            },
          },
        },
        orderBy: { contract: { signedAt: "desc" } },
      }),
      prisma.personnelMonthlyCostAdjustment.findMany({
        where: {
          confirmedAt: { not: null },
          OR: orMonthClauses,
        },
        select: {
          id: true,
          year: true,
          month: true,
          baseSalary: true,
          socialSecurityCompany: true,
          housingFundCompany: true,
          adjustmentAmount: true,
          bonus: true,
          penaltyAmount: true,
          leaveDeductionAmount: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      prisma.expensePayout.findMany({
        where: { paidAt: { gte: from, lte: to } },
        select: {
          id: true,
          amount: true,
          paidAt: true,
          claim: {
            select: {
              id: true,
              title: true,
              beneficiary: { select: { name: true } },
            },
          },
        },
        orderBy: { paidAt: "desc" },
      }),
      prisma.salesCost.findMany({
        where: { costDate: { gte: from, lte: to } },
        select: {
          id: true,
          costType: true,
          totalAmount: true,
          costDate: true,
          description: true,
          salesUser: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { costDate: "desc" },
      }),
    ]);

  const externalDetails: CostLedgerDetailRow[] = externalProducts.map((row) => {
    const amount = round2(productCostAmount(row));
    const signedAt = row.contract.signedAt;
    return {
      bucket: "external",
      id: row.id,
      date: signedAt ? format(signedAt, "yyyy-MM-dd") : "",
      title: row.productName,
      subtitle: [
        row.contract.signCustomer?.name,
        row.contract.contractNo || row.contract.title,
      ]
        .filter(Boolean)
        .join(" · "),
      amount,
      href: `/contracts/${row.contract.id}`,
    };
  });

  const laborDetails: CostLedgerDetailRow[] = [];
  for (const row of confirmedCosts) {
    const fixed = computeMonthlyCost({
      baseSalary: row.baseSalary != null ? Number(row.baseSalary) : null,
      socialSecurityCompany:
        row.socialSecurityCompany != null ? Number(row.socialSecurityCompany) : null,
      housingFundCompany:
        row.housingFundCompany != null ? Number(row.housingFundCompany) : null,
    });
    const amount = resolveEffectiveMonthlyCost(
      fixed,
      row.adjustmentAmount != null ? Number(row.adjustmentAmount) : 0,
      row.leaveDeductionAmount != null ? Number(row.leaveDeductionAmount) : 0,
      {
        bonus: row.bonus != null ? Number(row.bonus) : 0,
        penaltyAmount: row.penaltyAmount != null ? Number(row.penaltyAmount) : 0,
      }
    );
    if (amount == null) continue;
    laborDetails.push({
      bucket: "confirmed_labor",
      id: row.id,
      date: `${row.year}-${String(row.month).padStart(2, "0")}`,
      title: row.user.name,
      subtitle: `${row.year}年${row.month}月 · 已关账`,
      amount: round2(amount),
      href: `/personnel?tab=costs&year=${row.year}&month=${row.month}`,
    });
  }

  const expenseDetails: CostLedgerDetailRow[] = expensePayouts.map((row) => ({
    bucket: "paid_expenses",
    id: row.id,
    date: format(row.paidAt, "yyyy-MM-dd"),
    title: row.claim.title || "报销打款",
    subtitle: row.claim.beneficiary?.name ?? "",
    amount: round2(Number(row.amount)),
    href: `/expenses/${row.claim.id}`,
  }));

  const salesCostTypeLabel: Record<string, string> = {
    PERSONAL_TRAVEL: "个人差旅",
    PRESALES: "售前支持",
    BUSINESS: "商务费用",
  };

  const salesDetails: CostLedgerDetailRow[] = salesCosts.map((row) => ({
    bucket: "sales",
    id: row.id,
    date: format(row.costDate, "yyyy-MM-dd"),
    title: salesCostTypeLabel[row.costType] ?? row.costType,
    subtitle: [row.salesUser.name, row.customer?.name, row.description]
      .filter(Boolean)
      .join(" · "),
    amount: round2(Number(row.totalAmount)),
    href: `/sales-costs`,
  }));

  const sum = (rows: CostLedgerDetailRow[]) =>
    round2(rows.reduce((acc, r) => acc + r.amount, 0));

  const externalAmount = sum(externalDetails);
  const laborAmount = sum(laborDetails);
  const expenseAmount = sum(expenseDetails);
  const salesAmount = sum(salesDetails);

  const buckets: CostLedgerBucket[] = [
    {
      key: "external",
      label: "外部/合同成本",
      amount: externalAmount,
      hint: "区间内已签合同 · 未作废外部成本（按签约日）",
      href: `/contracts/external-costs`,
      detailCount: externalDetails.length,
    },
    {
      key: "confirmed_labor",
      label: "已确认人力",
      amount: laborAmount,
      hint: "PersonnelMonthlyCostAdjustment 已关账月成本",
      href: `/personnel?tab=costs&${yearMonthQs}`,
      detailCount: laborDetails.length,
    },
    {
      key: "paid_expenses",
      label: "已打款报销",
      amount: expenseAmount,
      hint: "按 ExpensePayout.paidAt 计入",
      href: `/expenses`,
      detailCount: expenseDetails.length,
    },
    {
      key: "sales",
      label: "销售费用",
      amount: salesAmount,
      hint: "SalesCost 按费用日计入",
      href: `/sales-costs?${yearMonthQs}`,
      detailCount: salesDetails.length,
    },
  ];

  const details = [
    ...externalDetails,
    ...laborDetails,
    ...expenseDetails,
    ...salesDetails,
  ];

  return {
    period,
    totalAmount: round2(buckets.reduce((acc, b) => acc + b.amount, 0)),
    buckets,
    details,
  };
}

export { opsRecentYears, periodQuery };

export function costLedgerCsv(details: CostLedgerDetailRow[]): string {
  const bucketLabel: Record<CostLedgerBucketKey, string> = {
    external: "外部/合同成本",
    confirmed_labor: "已确认人力",
    paid_expenses: "已打款报销",
    sales: "销售费用",
  };
  const header = ["分桶", "日期", "标题", "说明", "金额", "链接"];
  const lines = [header.join(",")];
  for (const row of details) {
    const cells = [
      bucketLabel[row.bucket],
      row.date,
      row.title,
      row.subtitle,
      String(row.amount),
      row.href ?? "",
    ].map(csvEscape);
    lines.push(cells.join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
