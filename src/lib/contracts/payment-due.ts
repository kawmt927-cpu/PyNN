import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { signedContractStatusFilter } from "@/lib/contracts/access";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
  type InstallmentPlanRow,
} from "@/lib/contracts/payment-waterfall";

/** 计划到期前 N 天内纳入「待收」提醒 */
export const PAYMENT_DUE_WARNING_DAYS = 7;

export type PaymentDueWeekRange = {
  weekStart: Date;
  weekEnd: Date;
};

export type PaymentDueItem = {
  installmentId: string;
  contractId: string;
  contractTitle: string;
  contractNo: string | null;
  customerId: string;
  customerName: string;
  ownerId: string;
  ownerName: string;
  periodNumber: number;
  plannedAmount: number;
  allocatedAmount: number;
  remainingAmount: number;
  percentComplete: number;
  dueAt: Date;
  overdue: boolean;
  dueSoon: boolean;
  condition?: string | null;
};

export type ContractPaymentDueBadge = {
  hasOverdue: boolean;
  hasDueSoon: boolean;
  overdueCount: number;
  dueSoonCount: number;
  /** 最早逾期期次的到期日 */
  earliestOverdueAt: Date | null;
};

type ContractWithPayments = Awaited<ReturnType<typeof fetchSignedContractsWithPayments>>[number];

function toInstallmentRows(
  installments: Array<{
    id: string;
    periodNumber: number;
    amount: { toString(): string };
    condition: string | null;
    dueAt: Date | null;
  }>
): InstallmentPlanRow[] {
  return installments.map((row) => ({
    id: row.id,
    periodNumber: row.periodNumber,
    amount: Number(row.amount),
    condition: row.condition,
    dueAt: row.dueAt,
  }));
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isDueSoon(dueAt: Date, now: Date) {
  const today = startOfDay(now);
  const dueDay = startOfDay(dueAt);
  if (dueDay < today) return false;
  return dueDay <= startOfDay(addDays(now, PAYMENT_DUE_WARNING_DAYS));
}

function isOverdue(dueAt: Date, now: Date) {
  return startOfDay(dueAt) < startOfDay(now);
}

function isDueThisWeek(dueAt: Date, week: PaymentDueWeekRange) {
  return dueAt >= week.weekStart && dueAt <= week.weekEnd;
}

export type ActionableInstallment = {
  id: string;
  periodNumber: number;
  amount: number;
  condition?: string | null;
  dueAt: Date;
  allocatedAmount: number;
  percentComplete: number;
  remainingAmount: number;
  overdue: boolean;
  dueSoon: boolean;
};

/** 瀑布算法下尚未结清、且已设置计划到期日的期次 */
export function listActionableInstallments(
  contract: {
    installments: Array<{
      id: string;
      periodNumber: number;
      amount: { toString(): string };
      condition: string | null;
      dueAt: Date | null;
    }>;
    paymentRecords: Array<{ amount: { toString(): string } }>;
  },
  now = new Date()
): ActionableInstallment[] {
  const totalPaid = sumPaymentRecords(contract.paymentRecords);
  const waterfall = allocatePaymentsWaterfall(totalPaid, toInstallmentRows(contract.installments));

  return waterfall
    .filter((row) => row.dueAt && row.percentComplete < 100)
    .map((row) => {
      const dueAt = new Date(row.dueAt as string | Date);
      const remainingAmount = Math.max(0, row.amount - row.allocatedAmount);
      return {
        id: row.id,
        periodNumber: row.periodNumber,
        amount: row.amount,
        condition: row.condition,
        dueAt,
        allocatedAmount: row.allocatedAmount,
        percentComplete: row.percentComplete,
        remainingAmount,
        overdue: isOverdue(dueAt, now),
        dueSoon: isDueSoon(dueAt, now),
      };
    });
}

export function summarizeContractPaymentDue(
  contract: Parameters<typeof listActionableInstallments>[0],
  now = new Date()
): ContractPaymentDueBadge {
  const actionable = listActionableInstallments(contract, now);
  const overdue = actionable.filter((row) => row.overdue);
  const dueSoon = actionable.filter((row) => row.dueSoon);

  return {
    hasOverdue: overdue.length > 0,
    hasDueSoon: dueSoon.length > 0,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    earliestOverdueAt:
      overdue.length > 0
        ? overdue.reduce((min, row) => (row.dueAt < min ? row.dueAt : min), overdue[0].dueAt)
        : null,
  };
}

async function fetchSignedContractsWithPayments(ownerId?: string) {
  return prisma.contract.findMany({
    where: {
      ...signedContractStatusFilter(),
      ...(ownerId ? { ownerId } : {}),
    },
    include: {
      signCustomer: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      installments: { orderBy: { periodNumber: "asc" } },
      paymentRecords: { select: { amount: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

function toPaymentDueItem(contract: ContractWithPayments, row: ActionableInstallment): PaymentDueItem {
  return {
    installmentId: row.id,
    contractId: contract.id,
    contractTitle: contract.title,
    contractNo: contract.contractNo,
    customerId: contract.signCustomer.id,
    customerName: contract.signCustomer.name,
    ownerId: contract.owner.id,
    ownerName: contract.owner.name,
    periodNumber: row.periodNumber,
    plannedAmount: row.amount,
    allocatedAmount: row.allocatedAmount,
    remainingAmount: row.remainingAmount,
    percentComplete: row.percentComplete,
    dueAt: row.dueAt,
    overdue: row.overdue,
    dueSoon: row.dueSoon,
    condition: row.condition,
  };
}

export async function listPaymentDueItems(options: {
  ownerId?: string;
  now?: Date;
  /** 仅逾期 */
  overdueOnly?: boolean;
  /** 本周待办：本周内到期或已逾期 */
  week?: PaymentDueWeekRange;
  take?: number;
}): Promise<PaymentDueItem[]> {
  const now = options.now ?? new Date();
  const contracts = await fetchSignedContractsWithPayments(options.ownerId);
  const items: PaymentDueItem[] = [];

  for (const contract of contracts) {
    for (const row of listActionableInstallments(contract, now)) {
      if (options.overdueOnly && !row.overdue) continue;
      if (options.week) {
        const inWeek = isDueThisWeek(row.dueAt, options.week);
        if (!inWeek && !row.overdue) continue;
      }
      items.push(toPaymentDueItem(contract, row));
    }
  }

  items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return options.take ? items.slice(0, options.take) : items;
}

export async function getContractPaymentDueBadgeMap(
  contractIds: string[],
  now = new Date()
): Promise<Map<string, ContractPaymentDueBadge>> {
  if (contractIds.length === 0) return new Map();

  const contracts = await prisma.contract.findMany({
    where: { id: { in: contractIds }, ...signedContractStatusFilter() },
    include: {
      installments: { orderBy: { periodNumber: "asc" } },
      paymentRecords: { select: { amount: true } },
    },
  });

  const map = new Map<string, ContractPaymentDueBadge>();
  for (const contract of contracts) {
    map.set(contract.id, summarizeContractPaymentDue(contract, now));
  }
  return map;
}

/** 销售管理：全员逾期 / 待收汇总 */
export async function listTeamPaymentDueOverview(now = new Date(), take = 50) {
  const overdue = await listPaymentDueItems({ overdueOnly: true, now, take });
  const dueSoon = await listPaymentDueItems({ now, take: take * 2 }).then((rows) =>
    rows.filter((row) => row.dueSoon && !row.overdue)
  );

  const byOwner = new Map<
    string,
    { ownerName: string; overdue: PaymentDueItem[]; dueSoon: PaymentDueItem[] }
  >();

  for (const row of overdue) {
    const bucket = byOwner.get(row.ownerId) ?? {
      ownerName: row.ownerName,
      overdue: [],
      dueSoon: [],
    };
    bucket.overdue.push(row);
    byOwner.set(row.ownerId, bucket);
  }

  for (const row of dueSoon) {
    const bucket = byOwner.get(row.ownerId) ?? {
      ownerName: row.ownerName,
      overdue: [],
      dueSoon: [],
    };
    if (!bucket.dueSoon.some((x) => x.installmentId === row.installmentId)) {
      bucket.dueSoon.push(row);
    }
    byOwner.set(row.ownerId, bucket);
  }

  return {
    overdue,
    dueSoon: dueSoon.slice(0, take),
    byOwner: [...byOwner.entries()].map(([ownerId, data]) => ({ ownerId, ...data })),
  };
}
