import { endOfMonth, format, startOfMonth, startOfYear, endOfYear } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SIGNED_CONTRACT_STATUSES } from "@/lib/contracts/access";
import { sumPaymentRecords } from "@/lib/contracts/payment-waterfall";
import type { ProjectStatus } from "@prisma/client";
import { selectMaintenanceContractsForPeriod } from "@/lib/contracts/maintenance";
import {
  getOutstandingArSummary,
  contractNetAmount,
  sumActiveExternalCosts,
  type OutstandingArSummary,
} from "@/lib/contracts/outstanding-ar";
import {
  getOpsCostSummary,
  type OpsCostSummary,
} from "@/lib/admin/ops-costs";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { resolveExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";

export type OpsPeriodPreset = "year" | "custom";

export type OpsPeriod = {
  preset: OpsPeriodPreset;
  /** 整年快捷选中时的年份；自定义跨度为 null */
  year: number | null;
  /** Inclusive month bounds */
  from: Date;
  to: Date;
  /** Display label e.g. 2026 年 / 2025-03～2026-02 */
  label: string;
  fromMonth: string; // yyyy-MM
  toMonth: string;
};

export type OpsContractRow = {
  id: string;
  title: string;
  contractNo: string | null;
  customerName: string;
  signedAt: Date | null;
  totalAmount: number;
  /** 合同累计已回款（不限区间） */
  collectedAmount: number;
  outstandingAmount: number;
};

/** 区间内按实际回款日计入的回款明细（可多笔） */
export type OpsPaymentRow = {
  id: string;
  contractId: string;
  contractTitle: string;
  contractNo: string | null;
  customerName: string;
  paidAt: Date;
  amount: number;
  /** 合同分期回款 / 保证金收回 */
  kind: "payment" | "deposit_recovery";
};

export type OpsProjectRow = {
  id: string;
  name: string;
  status: string;
  customerName: string | null;
  contractAmount: number;
};

export type OpsMaintenanceRow = {
  id: string;
  title: string;
  contractNo: string | null;
  customerName: string;
  maintenanceStartAt: Date;
  maintenanceEndAt: Date;
  maintenanceTotalAmount: number;
  annualMaintenanceAmount: number;
  contributionAmount: number;
};

export type OpsProjectStatusBucket = {
  status: string;
  count: number;
  contractAmount: number;
};

export type OpsDashboardData = {
  period: OpsPeriod;
  /** 净得：签约/回款/待回款均扣除未作废外部成本（内部实施成本仍计入合同） */
  net: boolean;
  contracts: {
    signedCount: number;
    signedAmount: number;
    /** 区间内按 paidAt 汇总的回款 */
    collectedAmount: number;
    /** 全盘待回款（不按签约年） */
    outstandingAmount: number;
    outstandingAr: OutstandingArSummary;
    rows: OpsContractRow[];
    paymentRows: OpsPaymentRow[];
  };
  maintenance: {
    totalAmount: number;
    count: number;
    rows: OpsMaintenanceRow[];
  };
  projects: {
    activeCount: number;
    contractAmount: number;
    rows: OpsProjectRow[];
    byStatus: OpsProjectStatusBucket[];
  };
  opportunities: Array<{
    id: string;
    title: string;
    grade: string | null;
    expectedAmount: number;
    customerName: string | null;
    ownerName: string;
    expectedCloseDate: Date;
  }>;
  /** 未签约 P0/P1 总数（与列表一致，列表不再截断） */
  opportunityFocusCount: number;
  upcoming: Array<{
    kind: string;
    id: string;
    title: string;
    subtitle: string;
    dueAt: Date;
    overdue: boolean;
    href: string;
  }>;
  expenses: {
    enabled: boolean;
    pendingManager: number;
    pendingHr: number;
    pendingPayout: number;
    paidThisMonthAmount: number;
  } | null;
  /** 区间总成本（外部项目 / 人力 / 其他） */
  costs: OpsCostSummary;
};

function monthKey(d: Date) {
  return format(d, "yyyy-MM");
}

function parseMonthKey(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
}

/** 近三年（含今年），从新到旧 */
export function opsRecentYears(now = new Date()): number[] {
  const y = now.getFullYear();
  return [y, y - 1, y - 2];
}

function fullYearPeriod(year: number): OpsPeriod {
  const ref = new Date(year, 0, 1);
  const from = startOfYear(ref);
  const to = endOfYear(ref);
  return {
    preset: "year",
    year,
    from,
    to,
    label: `${year} 年`,
    fromMonth: monthKey(from),
    toMonth: monthKey(to),
  };
}

export function resolveOpsPeriod(params: {
  year?: string | number | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): OpsPeriod {
  const now = params.now ?? new Date();
  const customFrom = parseMonthKey(params.from);
  const customTo = parseMonthKey(params.to);

  if (customFrom && customTo) {
    const from = startOfMonth(customFrom <= customTo ? customFrom : customTo);
    const to = endOfMonth(customFrom <= customTo ? customTo : customFrom);
    const fromMonth = monthKey(from);
    const toMonth = monthKey(to);
    const label = fromMonth === toMonth ? fromMonth : `${fromMonth}～${toMonth}`;
    return { preset: "custom", year: null, from, to, label, fromMonth, toMonth };
  }

  const yearNum =
    typeof params.year === "number"
      ? params.year
      : params.year
        ? Number(params.year)
        : NaN;
  if (Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= now.getFullYear() + 1) {
    return fullYearPeriod(yearNum);
  }

  // 兼容旧 preset
  if (params.preset === "lastYear") {
    return fullYearPeriod(now.getFullYear() - 1);
  }
  if (params.preset === "thisYear") {
    return fullYearPeriod(now.getFullYear());
  }

  return fullYearPeriod(now.getFullYear());
}

function calendarMonthRange(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

export async function getAdminOpsDashboard(
  adminUserId: string,
  periodInput: {
    year?: string | number | null;
    preset?: string | null;
    from?: string | null;
    to?: string | null;
    net?: string | boolean | null;
  } = {}
): Promise<OpsDashboardData> {
  const period = resolveOpsPeriod(periodInput);
  const net =
    periodInput.net === true ||
    periodInput.net === "1" ||
    periodInput.net === "true";
  const { from: monthFrom, to: monthTo } = calendarMonthRange();
  const expenseOn = await resolveExpenseFeatureEnabled();

  const productCostSelect = {
    where: { voidedAt: null },
    select: { costType: true, costAmount: true, actualCostPrice: true },
  } as const;

  const [
    signedContracts,
    periodPayments,
    periodDepositRecoveries,
    outstandingAr,
    maintenanceContracts,
    activeProjects,
    topOpps,
    upcomingBundle,
    expenseStats,
    costs,
  ] = await Promise.all([
    prisma.contract.findMany({
      where: {
        status: { in: [...SIGNED_CONTRACT_STATUSES] },
        signedAt: { gte: period.from, lte: period.to },
      },
      orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        contractNo: true,
        totalAmount: true,
        signedAt: true,
        signCustomer: { select: { name: true } },
        paymentRecords: { select: { amount: true } },
        products: net ? productCostSelect : false,
      },
    }),
    prisma.contractPaymentRecord.findMany({
      where: {
        paidAt: { gte: period.from, lte: period.to },
        contract: { status: { in: [...SIGNED_CONTRACT_STATUSES] } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        amount: true,
        paidAt: true,
        contract: {
          select: {
            id: true,
            title: true,
            contractNo: true,
            totalAmount: true,
            signCustomer: { select: { name: true } },
            products: net ? productCostSelect : false,
          },
        },
      },
    }),
    prisma.contractDepositRecovery.findMany({
      where: {
        recoveredAt: { gte: period.from, lte: period.to },
        deposit: {
          contract: { status: { in: [...SIGNED_CONTRACT_STATUSES] } },
        },
      },
      orderBy: [{ recoveredAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        amount: true,
        recoveredAt: true,
        deposit: {
          select: {
            contract: {
              select: {
                id: true,
                title: true,
                contractNo: true,
                signCustomer: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    getOutstandingArSummary({ net }),
    prisma.contract.findMany({
      where: {
        status: { in: [...SIGNED_CONTRACT_STATUSES] },
        businessType: "MAINTENANCE",
        maintenanceStartAt: { not: null, lte: period.to },
        maintenanceEndAt: { not: null, gte: period.from },
        annualMaintenanceAmount: { not: null },
      },
      orderBy: [{ maintenanceStartAt: "desc" }],
      select: {
        id: true,
        title: true,
        contractNo: true,
        totalAmount: true,
        signCustomerId: true,
        endUserCustomerId: true,
        maintenanceStartAt: true,
        maintenanceEndAt: true,
        maintenanceTotalAmount: true,
        annualMaintenanceAmount: true,
        signCustomer: { select: { name: true } },
        endUserCustomer: { select: { name: true } },
        paymentRecords: { select: { amount: true } },
      },
    }),
    prisma.project.findMany({
      where: {
        status: { in: ["PENDING_START", "IMPLEMENTING", "ACCEPTED", "MAINTAINING"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        status: true,
        customer: { select: { name: true } },
        contract: { select: { totalAmount: true } },
      },
    }),
    prisma.opportunity.findMany({
      where: {
        status: "NOT_SIGNED",
        grade: { in: ["P0", "P1"] },
      },
      orderBy: [{ expectedCloseDate: "asc" }, { grade: "asc" }],
      select: {
        id: true,
        title: true,
        grade: true,
        expectedAmount: true,
        expectedCloseDate: true,
        customer: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    listUpcomingActionsThisWeek("ADMIN", adminUserId, 12),
    expenseOn
      ? Promise.all([
          prisma.expenseClaim.count({ where: { status: "PENDING_MANAGER" } }),
          prisma.expenseClaim.count({ where: { status: "PENDING_HR" } }),
          prisma.expenseClaim.count({ where: { status: "PENDING_PAYOUT" } }),
          prisma.expensePayout.aggregate({
            where: { paidAt: { gte: monthFrom, lt: monthTo } },
            _sum: { amount: true },
          }),
        ])
      : Promise.resolve(null),
    getOpsCostSummary({ from: period.from, to: period.to }),
  ]);

  const contractRows: OpsContractRow[] = signedContracts.map((row) => {
    const grossTotal = Number(row.totalAmount);
    const externalCost = net
      ? sumActiveExternalCosts(
          "products" in row && Array.isArray(row.products) ? row.products : []
        )
      : 0;
    const total = net ? contractNetAmount(grossTotal, externalCost) : grossTotal;
    const collectedGross = Math.min(sumPaymentRecords(row.paymentRecords), grossTotal);
    const collected = net
      ? Math.min(collectedGross, total)
      : collectedGross;
    return {
      id: row.id,
      title: row.title,
      contractNo: row.contractNo,
      customerName: row.signCustomer.name,
      signedAt: row.signedAt,
      totalAmount: total,
      collectedAmount: collected,
      outstandingAmount: Math.max(0, total - collected),
    };
  });

  const paymentRows: OpsPaymentRow[] = [
    ...periodPayments.map((row) => {
      const grossAmount = Number(row.amount);
      let amount = grossAmount;
      if (net) {
        const grossTotal = Number(row.contract.totalAmount);
        const externalCost = sumActiveExternalCosts(
          "products" in row.contract && Array.isArray(row.contract.products)
            ? row.contract.products
            : []
        );
        const netTotal = contractNetAmount(grossTotal, externalCost);
        const ratio = grossTotal > 0.01 ? Math.min(1, netTotal / grossTotal) : 1;
        amount = Math.round(grossAmount * ratio * 100) / 100;
      }
      return {
        id: row.id,
        contractId: row.contract.id,
        contractTitle: row.contract.title,
        contractNo: row.contract.contractNo,
        customerName: row.contract.signCustomer.name,
        paidAt: row.paidAt,
        amount,
        kind: "payment" as const,
      };
    }),
    ...periodDepositRecoveries.map((row) => ({
      id: row.id,
      contractId: row.deposit.contract.id,
      contractTitle: row.deposit.contract.title,
      contractNo: row.deposit.contract.contractNo,
      customerName: row.deposit.contract.signCustomer.name,
      paidAt: row.recoveredAt,
      amount: Number(row.amount),
      kind: "deposit_recovery" as const,
    })),
  ].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

  let signedAmount = 0;
  for (const row of contractRows) {
    signedAmount += row.totalAmount;
  }
  const collectedAmount = paymentRows.reduce((sum, row) => sum + row.amount, 0);
  const outstandingAmount = outstandingAr.totalRemaining;

  const maintenanceSelected = selectMaintenanceContractsForPeriod({
    candidates: maintenanceContracts
      .filter(
        (row) =>
          row.maintenanceStartAt &&
          row.maintenanceEndAt &&
          row.annualMaintenanceAmount != null
      )
      .map((row) => ({
        id: row.id,
        endUserCustomerId: row.endUserCustomerId,
        signCustomerId: row.signCustomerId,
        maintenanceStartAt: row.maintenanceStartAt!,
        maintenanceEndAt: row.maintenanceEndAt!,
        annualMaintenanceAmount: Number(row.annualMaintenanceAmount),
        paidAmount: sumPaymentRecords(row.paymentRecords),
        totalAmount: Number(row.totalAmount),
      })),
    periodFrom: period.from,
    periodTo: period.to,
  });
  const maintenanceById = new Map(maintenanceContracts.map((row) => [row.id, row]));
  const maintenanceRows: OpsMaintenanceRow[] = maintenanceSelected.map((row) => {
    const full = maintenanceById.get(row.id)!;
    return {
      id: row.id,
      title: full.title,
      contractNo: full.contractNo,
      customerName: full.endUserCustomer.name || full.signCustomer.name,
      maintenanceStartAt: row.maintenanceStartAt,
      maintenanceEndAt: row.maintenanceEndAt,
      maintenanceTotalAmount: Number(full.maintenanceTotalAmount ?? 0),
      annualMaintenanceAmount: row.annualMaintenanceAmount,
      contributionAmount: row.contributionAmount,
    };
  });
  const maintenanceTotal = maintenanceRows.reduce((sum, row) => sum + row.contributionAmount, 0);

  const projectRows: OpsProjectRow[] = activeProjects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    customerName: p.customer?.name ?? null,
    contractAmount: Number(p.contract?.totalAmount ?? 0),
  }));

  const projectContractAmount = projectRows.reduce((sum, p) => sum + p.contractAmount, 0);

  const statusOrder: ProjectStatus[] = [
    "PENDING_START",
    "IMPLEMENTING",
    "ACCEPTED",
    "MAINTAINING",
  ];
  const byStatusMap = new Map<string, OpsProjectStatusBucket>();
  for (const status of statusOrder) {
    byStatusMap.set(status, { status, count: 0, contractAmount: 0 });
  }
  for (const row of projectRows) {
    const bucket = byStatusMap.get(row.status) ?? {
      status: row.status,
      count: 0,
      contractAmount: 0,
    };
    bucket.count += 1;
    bucket.contractAmount += row.contractAmount;
    byStatusMap.set(row.status, bucket);
  }
  const byStatus = statusOrder
    .map((s) => byStatusMap.get(s)!)
    .filter((b) => b.count > 0);

  const upcoming = upcomingBundle.items.map((item) => {
    let href = "/plans-tasks";
    if (item.kind === "follow_up") {
      href = item.customerId ? `/customers/${item.customerId}` : "/follow-ups";
    } else if (item.kind === "assignment") {
      href = "/plans-tasks?tab=tasks";
    }
    return {
      kind: item.kind,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      dueAt: item.dueAt,
      overdue: item.overdue,
      href,
    };
  });

  return {
    period,
    net,
    contracts: {
      signedCount: contractRows.length,
      signedAmount,
      collectedAmount,
      outstandingAmount,
      outstandingAr,
      rows: contractRows,
      paymentRows,
    },
    maintenance: {
      totalAmount: Math.round(maintenanceTotal * 100) / 100,
      count: maintenanceRows.length,
      rows: maintenanceRows,
    },
    projects: {
      activeCount: projectRows.length,
      contractAmount: projectContractAmount,
      rows: projectRows,
      byStatus,
    },
    opportunities: topOpps.map((o) => ({
      id: o.id,
      title: o.title,
      grade: o.grade,
      expectedAmount: Number(o.expectedAmount),
      customerName: o.customer?.name ?? null,
      ownerName: o.owner.name,
      expectedCloseDate: o.expectedCloseDate,
    })),
    opportunityFocusCount: topOpps.length,
    upcoming,
    expenses: expenseOn
      ? {
          enabled: true,
          pendingManager: expenseStats?.[0] ?? 0,
          pendingHr: expenseStats?.[1] ?? 0,
          pendingPayout: expenseStats?.[2] ?? 0,
          paidThisMonthAmount: Number(expenseStats?.[3]?._sum.amount ?? 0),
        }
      : { enabled: false, pendingManager: 0, pendingHr: 0, pendingPayout: 0, paidThisMonthAmount: 0 },
    costs,
  };
}
