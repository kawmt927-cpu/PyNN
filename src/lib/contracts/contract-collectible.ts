import type { ContractStatus } from "@prisma/client";
import { startOfDay } from "date-fns";
import { isSignedContractStatus } from "@/lib/contracts/access";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
} from "@/lib/contracts/payment-waterfall";
import {
  COLLECTION_STATUS_LABELS,
  resolveEffectiveCollectionStatus,
  type EffectiveCollectionStatus,
} from "@/lib/contracts/installment-collection-status";
import type { PaymentDueFilterValue } from "@/lib/contracts/payment-due";

export type CollectFilterValue =
  | "ready"
  | "difficult"
  | "bad_debt"
  | "partial"
  | "pending";

export type SettlementFilterValue = "open" | "all" | "settled";

export type ContractCollectibleInput = {
  status: ContractStatus;
  totalAmount: number | { toString(): string };
  installments: Array<{
    id: string;
    periodNumber: number;
    amount: number | { toString(): string };
    condition: string | null;
    dueAt: Date | null;
    collectionStatus: string;
  }>;
  paymentRecords: Array<{ amount: number | { toString(): string } }>;
};

export type CollectiblePeriod = {
  installmentId: string;
  periodNumber: number;
  condition: string | null;
  dueAt: Date | null;
  remainingAmount: number;
  percentComplete: number;
  collectionStatus: EffectiveCollectionStatus;
  collectionStatusLabel: string;
  overdue: boolean;
};

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isOverdue(dueAt: Date, now: Date) {
  return startOfDay(dueAt) < startOfDay(now);
}

function isDueWithinDays(dueAt: Date, now: Date, days: number) {
  const today = startOfDay(now);
  const dueDay = startOfDay(dueAt);
  if (dueDay < today) return false;
  return dueDay <= startOfDay(addDays(now, days));
}

export function analyzeContractCollectible(
  contract: ContractCollectibleInput,
  now = new Date()
) {
  const totalAmount = Number(contract.totalAmount);
  const paid = Math.min(sumPaymentRecords(contract.paymentRecords), totalAmount);
  const waterfall = allocatePaymentsWaterfall(
    paid,
    contract.installments.map((row) => ({
      id: row.id,
      periodNumber: row.periodNumber,
      amount: Number(row.amount),
      condition: row.condition,
      dueAt: row.dueAt,
    }))
  );

  const periods: CollectiblePeriod[] = [];
  let collectibleRemaining = 0;
  let badDebtRemaining = 0;
  let hasReady = false;
  let hasDifficult = false;
  let hasPending = false;
  let hasBadDebtStatus = contract.installments.some(
    (row) => row.collectionStatus === "BAD_DEBT"
  );

  for (const row of waterfall) {
    const remaining = Math.max(0, row.amount - row.allocatedAmount);
    const installment = contract.installments.find((item) => item.id === row.id);
    const collectionStatus = resolveEffectiveCollectionStatus({
      percentComplete: row.percentComplete,
      collectionStatus: installment?.collectionStatus ?? "NOT_STARTED",
    });
    const dueAt = row.dueAt ? new Date(row.dueAt) : null;
    const period: CollectiblePeriod = {
      installmentId: row.id,
      periodNumber: row.periodNumber,
      condition: row.condition ?? null,
      dueAt,
      remainingAmount: Math.round(remaining * 100) / 100,
      percentComplete: row.percentComplete,
      collectionStatus,
      collectionStatusLabel: COLLECTION_STATUS_LABELS[collectionStatus],
      overdue: dueAt ? isOverdue(dueAt, now) : false,
    };
    periods.push(period);

    if (remaining <= 0.01) continue;
    if (collectionStatus === "BAD_DEBT") {
      badDebtRemaining += remaining;
      continue;
    }
    if (collectionStatus === "COMPLETED") continue;

    collectibleRemaining += remaining;
    if (collectionStatus === "READY" || collectionStatus === "IN_COLLECTION") {
      hasReady = true;
    } else if (collectionStatus === "DIFFICULT") {
      hasDifficult = true;
    } else if (collectionStatus === "NOT_STARTED") {
      hasPending = true;
    }
  }

  collectibleRemaining = Math.round(collectibleRemaining * 100) / 100;
  badDebtRemaining = Math.round(badDebtRemaining * 100) / 100;

  const signed = isSignedContractStatus(contract.status);
  const isSettled = signed && collectibleRemaining <= 0.01;

  return {
    totalAmount,
    paid,
    collectibleRemaining,
    badDebtRemaining,
    periods,
    hasReady,
    hasDifficult,
    hasPending,
    hasBadDebtStatus,
    signed,
    isSettled,
    isPartial: paid > 0.01 && paid < totalAmount - 0.01 && collectibleRemaining > 0.01,
  };
}

export function matchesSettlementFilter(
  analysis: ReturnType<typeof analyzeContractCollectible>,
  settlement: SettlementFilterValue
): boolean {
  if (settlement === "all") return true;
  if (!analysis.signed) {
    // 未签署：出现在「未完成」，不出现在「已结清」
    return settlement === "open";
  }
  if (settlement === "open") return !analysis.isSettled;
  return analysis.isSettled;
}

export function matchesCollectFilter(
  analysis: ReturnType<typeof analyzeContractCollectible>,
  collect: CollectFilterValue | undefined
): boolean {
  if (!collect) return true;
  if (!analysis.signed) return false;
  switch (collect) {
    case "ready":
      return analysis.hasReady;
    case "difficult":
      return analysis.hasDifficult;
    case "bad_debt":
      return analysis.hasBadDebtStatus;
    case "partial":
      return analysis.isPartial;
    case "pending":
      return analysis.hasPending;
    default:
      return true;
  }
}

export function listWindowCollectibleInstallments(
  analysis: ReturnType<typeof analyzeContractCollectible>,
  dueWithin: PaymentDueFilterValue,
  now = new Date()
): CollectiblePeriod[] {
  return analysis.periods.filter((period) => {
    if (!period.dueAt || period.remainingAmount <= 0.01) return false;
    if (
      period.collectionStatus === "BAD_DEBT" ||
      period.collectionStatus === "COMPLETED"
    ) {
      return false;
    }
    if (dueWithin === "overdue") return period.overdue;
    const days =
      dueWithin === "30" ? 30 : dueWithin === "90" ? 90 : dueWithin === "180" ? 180 : 30;
    return !period.overdue && isDueWithinDays(period.dueAt, now, days);
  });
}

export function matchesDueWithinFilter(
  analysis: ReturnType<typeof analyzeContractCollectible>,
  dueWithin: PaymentDueFilterValue | undefined,
  now = new Date()
): boolean {
  if (!dueWithin) return true;
  if (!analysis.signed) return false;
  return listWindowCollectibleInstallments(analysis, dueWithin, now).length > 0;
}
