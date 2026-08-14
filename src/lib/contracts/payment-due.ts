import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { signedContractStatusFilter } from "@/lib/contracts/access";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
  type InstallmentPlanRow,
} from "@/lib/contracts/payment-waterfall";
import { resolveEffectiveCollectionStatus } from "@/lib/contracts/installment-collection-status";

/** 计划到期前 N 天内纳入「待收」提醒（兼容旧逻辑） */
export const PAYMENT_DUE_WARNING_DAYS = 7;

/** 今日工作催收标签：先窗口后逾期；窗口为未来 N 天内到期（不含已逾期） */
export const PAYMENT_DUE_FILTERS = [
  { value: "30", label: "1 个月", withinDays: 30 },
  { value: "90", label: "3 个月", withinDays: 90 },
  { value: "180", label: "6 个月", withinDays: 180 },
  { value: "overdue", label: "逾期", withinDays: null },
] as const;

export type PaymentDueFilterValue = (typeof PAYMENT_DUE_FILTERS)[number]["value"];

/** 窗口类标签（用于角标数量） */
export const PAYMENT_DUE_WINDOW_FILTERS = PAYMENT_DUE_FILTERS.filter(
  (row) => row.value !== "overdue"
);

export function parsePaymentDueFilter(
  raw: string | undefined
): PaymentDueFilterValue {
  if (raw === "30" || raw === "90" || raw === "180" || raw === "overdue") return raw;
  // 兼容旧链接
  if (raw === "15") return "30";
  return "overdue";
}

function withinDaysForFilter(filter: PaymentDueFilterValue): number | null {
  if (filter === "overdue") return null;
  if (filter === "30") return 30;
  if (filter === "90") return 90;
  if (filter === "180") return 180;
  return null;
}

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
  /** 列表展示用：逾期合并后含多期 */
  periodNumbers: number[];
  installmentIds: string[];
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

function isDueWithinDays(dueAt: Date, now: Date, days: number) {
  const today = startOfDay(now);
  const dueDay = startOfDay(dueAt);
  if (dueDay < today) return false;
  return dueDay <= startOfDay(addDays(now, days));
}

function matchesPaymentDueFilter(
  row: ActionableInstallment,
  filter: PaymentDueFilterValue,
  now: Date
) {
  if (filter === "overdue") return row.overdue;
  const withinDays = withinDaysForFilter(filter);
  if (withinDays == null) return false;
  return !row.overdue && isDueWithinDays(row.dueAt, now, withinDays);
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

/** 瀑布算法下尚未结清、非坏账、且已设置计划到期日的期次 */
export function listActionableInstallments(
  contract: {
    installments: Array<{
      id: string;
      periodNumber: number;
      amount: { toString(): string };
      condition: string | null;
      dueAt: Date | null;
      collectionStatus?: string | null;
    }>;
    paymentRecords: Array<{ amount: { toString(): string } }>;
  },
  now = new Date()
): ActionableInstallment[] {
  const totalPaid = sumPaymentRecords(contract.paymentRecords);
  const waterfall = allocatePaymentsWaterfall(totalPaid, toInstallmentRows(contract.installments));
  const statusById = new Map(
    contract.installments.map((row) => [row.id, row.collectionStatus ?? "NOT_STARTED"])
  );

  return waterfall
    .filter((row) => {
      if (!row.dueAt || row.percentComplete >= 100) return false;
      const effective = resolveEffectiveCollectionStatus({
        percentComplete: row.percentComplete,
        collectionStatus: statusById.get(row.id) ?? "NOT_STARTED",
      });
      return effective !== "BAD_DEBT";
    })
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
        dueSoon: isDueWithinDays(dueAt, now, PAYMENT_DUE_WARNING_DAYS),
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
    periodNumbers: [row.periodNumber],
    installmentIds: [row.id],
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

/** 逾期期次按合同合并为一条 */
export function mergeOverdueItemsByContract(items: PaymentDueItem[]): PaymentDueItem[] {
  const byContract = new Map<string, PaymentDueItem[]>();
  for (const row of items) {
    const list = byContract.get(row.contractId) ?? [];
    list.push(row);
    byContract.set(row.contractId, list);
  }

  const merged: PaymentDueItem[] = [];
  for (const rows of byContract.values()) {
    rows.sort((a, b) => a.periodNumber - b.periodNumber);
    const earliest = rows.reduce((min, row) =>
      row.dueAt.getTime() < min.dueAt.getTime() ? row : min
    );
    const remainingAmount = Math.round(
      rows.reduce((sum, row) => sum + row.remainingAmount, 0) * 100
    ) / 100;
    const plannedAmount = Math.round(
      rows.reduce((sum, row) => sum + row.plannedAmount, 0) * 100
    ) / 100;
    const allocatedAmount = Math.round(
      rows.reduce((sum, row) => sum + row.allocatedAmount, 0) * 100
    ) / 100;
    merged.push({
      ...earliest,
      installmentId: rows[0].installmentId,
      installmentIds: rows.map((row) => row.installmentId),
      periodNumber: rows[0].periodNumber,
      periodNumbers: rows.map((row) => row.periodNumber),
      remainingAmount,
      plannedAmount,
      allocatedAmount,
      percentComplete:
        plannedAmount > 0.01
          ? Math.min(100, Math.round((allocatedAmount / plannedAmount) * 1000) / 10)
          : 0,
      dueAt: earliest.dueAt,
      overdue: true,
    });
  }

  merged.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return merged;
}

/** 销售管理：按筛选标签列出回款；逾期按合同合并 */
export async function listTeamPaymentDueByFilter(
  filter: PaymentDueFilterValue,
  now = new Date(),
  take = 80
) {
  const contracts = await fetchSignedContractsWithPayments();
  const allByFilter: Record<PaymentDueFilterValue, PaymentDueItem[]> = {
    "30": [],
    "90": [],
    "180": [],
    overdue: [],
  };

  for (const contract of contracts) {
    for (const row of listActionableInstallments(contract, now)) {
      const item = toPaymentDueItem(contract, row);
      for (const option of PAYMENT_DUE_FILTERS) {
        if (matchesPaymentDueFilter(row, option.value, now)) {
          allByFilter[option.value].push(item);
        }
      }
    }
  }

  for (const key of Object.keys(allByFilter) as PaymentDueFilterValue[]) {
    allByFilter[key].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  }

  const windowCounts: Record<"30" | "90" | "180", number> = {
    "30": allByFilter["30"].length,
    "90": allByFilter["90"].length,
    "180": allByFilter["180"].length,
  };

  const overdueMerged = mergeOverdueItemsByContract(allByFilter.overdue);
  const items = (filter === "overdue" ? overdueMerged : allByFilter[filter]).slice(
    0,
    take
  );

  const byOwner = new Map<
    string,
    { ownerName: string; count: number; overdueCount: number }
  >();
  for (const row of items) {
    const bucket = byOwner.get(row.ownerId) ?? {
      ownerName: row.ownerName,
      count: 0,
      overdueCount: 0,
    };
    bucket.count += 1;
    if (row.overdue) bucket.overdueCount += 1;
    byOwner.set(row.ownerId, bucket);
  }

  return {
    filter,
    items,
    byOwner: [...byOwner.entries()].map(([ownerId, data]) => ({ ownerId, ...data })),
    windowCounts,
    overdueContractCount: overdueMerged.length,
  };
}

/** @deprecated 保留给旧调用；新 UI 使用 listTeamPaymentDueByFilter */
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

/** 与指派弹窗预填标题保持一致，用于识别「已指派回款任务」 */
export function paymentCollectionAssignTitle(item: {
  contractTitle: string;
  periodNumber: number;
  periodNumbers?: number[];
}) {
  const periods = item.periodNumbers?.length ? item.periodNumbers : [item.periodNumber];
  if (periods.length <= 1) {
    return `催收回款：${item.contractTitle} 第 ${periods[0]} 期`;
  }
  return `催收回款：${item.contractTitle}（逾期 ${periods.length} 期）`;
}

export function paymentCollectionAssignTitlesForItem(item: {
  contractTitle: string;
  periodNumber: number;
  periodNumbers?: number[];
}): string[] {
  const periods = item.periodNumbers?.length ? item.periodNumbers : [item.periodNumber];
  const titles = periods.map(
    (periodNumber) => `催收回款：${item.contractTitle} 第 ${periodNumber} 期`
  );
  if (periods.length > 1) {
    titles.push(paymentCollectionAssignTitle(item));
  }
  return titles;
}

/** 未完成的催收回款指派任务标题集合 */
export async function listOpenPaymentCollectionAssignmentTitles(): Promise<string[]> {
  const rows = await prisma.salesWeeklyAssignment.findMany({
    where: {
      status: { in: ["PENDING", "PENDING_CONFIRM"] },
      kind: "CUSTOMER_FOLLOW_UP",
      title: { startsWith: "催收回款：" },
    },
    select: { title: true },
  });
  return [...new Set(rows.map((row) => row.title))];
}
