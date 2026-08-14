import { SIGNED_CONTRACT_STATUSES } from "@/lib/contracts/access";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
} from "@/lib/contracts/payment-waterfall";
import { depositOutstandingAmount } from "@/lib/contracts/deposits";
import {
  collectionStatusToArSegment,
  resolveEffectiveCollectionStatus,
  type EffectiveCollectionStatus,
} from "@/lib/contracts/installment-collection-status";
import { prisma } from "@/lib/prisma";

export type OutstandingArSegment =
  | "ready"
  | "difficult"
  | "pending"
  | "awaiting"
  | "deposit";

export type OutstandingArLine = {
  installmentId: string | null;
  /** 保证金行用 depositId */
  depositId: string | null;
  lineKind: "installment" | "deposit";
  contractId: string;
  contractTitle: string;
  contractNo: string | null;
  /** 最终用户（直接客户） */
  endUserCustomerName: string;
  /** 签约客户；间接合同时与最终用户不同 */
  signCustomerName: string;
  signingType: "DIRECT" | "INDIRECT" | string;
  /** @deprecated 兼容旧调用；等同 signCustomerName */
  customerName: string;
  periodNumber: number | null;
  condition: string | null;
  /** 分期计划到期日；保证金/无分期余额为 null */
  dueAt: Date | null;
  phaseId: string | null;
  phaseName: string | null;
  phaseCompleted: boolean;
  collectionStatus: EffectiveCollectionStatus;
  /** @deprecated 使用 collectionStatus === "DIFFICULT" */
  collectionDifficulty: boolean;
  segment: OutstandingArSegment;
  remainingAmount: number;
  plannedAmount: number;
  allocatedAmount: number;
};

export type OutstandingArSummary = {
  totalRemaining: number;
  readyAmount: number;
  difficultAmount: number;
  /** 实施中：催收状态为「未开始」的最近一期未回款 */
  pendingAmount: number;
  /** 待实施：同合同后续「未开始」未回款 */
  awaitingAmount: number;
  depositAmount: number;
  lines: OutstandingArLine[];
};

/** 未作废的外部成本合计（过单/接口/分包等）；内部实施成本不计入 */
export function sumActiveExternalCosts(
  products: Array<{
    costType?: string | null;
    costAmount?: number | { toString(): string } | null;
    actualCostPrice?: number | { toString(): string } | null;
    voidedAt?: Date | null;
  }>
) {
  return products
    .filter((row) => !row.voidedAt && row.costType === "EXTERNAL")
    .reduce((sum, row) => sum + Number(row.costAmount || row.actualCostPrice || 0), 0);
}

/** @deprecated 请用 sumActiveExternalCosts；保留别名避免外部误用 */
export function sumActiveProductCosts(
  products: Array<{
    costType?: string | null;
    costAmount?: number | { toString(): string } | null;
    actualCostPrice?: number | { toString(): string } | null;
    voidedAt?: Date | null;
  }>
) {
  return sumActiveExternalCosts(products);
}

export function contractNetAmount(grossTotal: number, externalCost: number) {
  return Math.max(0, Math.round((grossTotal - externalCost) * 100) / 100);
}

/**
 * 全盘已签合同待回款分段（不按签约年筛选）。
 * - ready：催收状态为可催款 / 回款中
 * - difficult：回款困难
 * - pending（实施中）：未开始中最近一期
 * - awaiting（待实施）：未开始中后续期
 * - deposit：保证金未收回余额
 * - 坏账 / 已完成：不计入任何分段与总额
 * - net：按合同额扣除未作废外部成本后的净待收（内部实施成本仍计入合同）；保证金不受净得影响
 */
export async function getOutstandingArSummary(options?: {
  net?: boolean;
}): Promise<OutstandingArSummary> {
  const net = Boolean(options?.net);
  const contracts = await prisma.contract.findMany({
    where: { status: { in: [...SIGNED_CONTRACT_STATUSES] } },
    select: {
      id: true,
      title: true,
      contractNo: true,
      totalAmount: true,
      signingType: true,
      signCustomer: { select: { name: true } },
      endUserCustomer: { select: { name: true } },
      paymentRecords: { select: { amount: true } },
      products: net
        ? {
            where: { voidedAt: null },
            select: { costType: true, costAmount: true, actualCostPrice: true },
          }
        : false,
      installments: {
        orderBy: { periodNumber: "asc" },
        select: {
          id: true,
          periodNumber: true,
          amount: true,
          condition: true,
          dueAt: true,
          phaseId: true,
          collectionStatus: true,
          phase: { select: { id: true, name: true, status: true } },
        },
      },
      deposits: {
        orderBy: { paidOutAt: "asc" },
        select: {
          id: true,
          amount: true,
          recoverCondition: true,
          recoveries: { select: { amount: true } },
        },
      },
    },
  });

  const lines: OutstandingArLine[] = [];
  let readyAmount = 0;
  let difficultAmount = 0;
  let pendingAmount = 0;
  let awaitingAmount = 0;
  let depositAmount = 0;

  for (const contract of contracts) {
    const signCustomerName = contract.signCustomer.name;
    const endUserCustomerName = contract.endUserCustomer.name;
    const signingType = contract.signingType;

    const pushBase = {
      contractId: contract.id,
      contractTitle: contract.title,
      contractNo: contract.contractNo,
      endUserCustomerName,
      signCustomerName,
      signingType,
      customerName: signCustomerName,
    };

    const grossTotal = Number(contract.totalAmount);
    const externalCost = net
      ? sumActiveExternalCosts(
          "products" in contract && Array.isArray(contract.products) ? contract.products : []
        )
      : 0;
    const total = net ? contractNetAmount(grossTotal, externalCost) : grossTotal;
    const paid = Math.min(sumPaymentRecords(contract.paymentRecords), grossTotal);
    const grossRemaining = Math.max(0, grossTotal - paid);
    const netRemaining = Math.max(0, total - paid);
    const scale =
      net && grossRemaining > 0.01 ? Math.min(1, netRemaining / grossRemaining) : 1;

    const hasInstallmentAr =
      grossRemaining > 0.01 && (!net || netRemaining > 0.01);

    if (hasInstallmentAr) {
      if (contract.installments.length === 0) {
        const segment: OutstandingArSegment = "pending";
        const contractRemaining = Math.round(grossRemaining * scale * 100) / 100;
        pendingAmount += contractRemaining;
        lines.push({
          ...pushBase,
          installmentId: null,
          depositId: null,
          lineKind: "installment",
          periodNumber: null,
          condition: null,
          dueAt: null,
          phaseId: null,
          phaseName: null,
          phaseCompleted: false,
          collectionStatus: "NOT_STARTED",
          collectionDifficulty: false,
          segment,
          remainingAmount: contractRemaining,
          plannedAmount: total,
          allocatedAmount: Math.min(paid, total),
        });
      } else {
        const waterfall = allocatePaymentsWaterfall(
          paid,
          contract.installments.map((row) => ({
            id: row.id,
            periodNumber: row.periodNumber,
            amount: Number(row.amount),
            condition: row.condition,
          }))
        );

        type DraftLine = {
          row: (typeof waterfall)[number];
          installment: (typeof contract.installments)[number] | undefined;
          phaseCompleted: boolean;
          collectionStatus: EffectiveCollectionStatus;
          baseSegment: "ready" | "difficult" | "pending";
          amount: number;
        };

        const drafts: DraftLine[] = [];
        for (const row of waterfall) {
          const remaining = Math.max(0, row.amount - row.allocatedAmount);
          if (remaining <= 0.01) continue;
          const amount = Math.round(remaining * scale * 100) / 100;
          if (amount <= 0.01) continue;

          const installment = contract.installments.find((item) => item.id === row.id);
          const phaseCompleted = installment?.phase?.status === "COMPLETED";
          const collectionStatus = resolveEffectiveCollectionStatus({
            percentComplete: row.percentComplete,
            collectionStatus: installment?.collectionStatus ?? "NOT_STARTED",
          });
          const mapped = collectionStatusToArSegment(collectionStatus);
          if (!mapped) continue;
          drafts.push({
            row,
            installment,
            phaseCompleted,
            collectionStatus,
            baseSegment: mapped,
            amount,
          });
        }

        // 「未开始」中期数最小的一期为「实施中」，其后为「待实施」
        let nearestPendingSeen = false;
        for (const draft of drafts) {
          let segment: OutstandingArSegment = draft.baseSegment;
          if (draft.baseSegment === "pending") {
            if (!nearestPendingSeen) {
              nearestPendingSeen = true;
              segment = "pending";
            } else {
              segment = "awaiting";
            }
          }

          if (segment === "ready") readyAmount += draft.amount;
          else if (segment === "difficult") difficultAmount += draft.amount;
          else if (segment === "awaiting") awaitingAmount += draft.amount;
          else pendingAmount += draft.amount;

          lines.push({
            ...pushBase,
            installmentId: draft.row.id,
            depositId: null,
            lineKind: "installment",
            periodNumber: draft.row.periodNumber,
            condition: draft.row.condition ?? null,
            dueAt: draft.installment?.dueAt ?? null,
            phaseId: draft.installment?.phaseId ?? null,
            phaseName: draft.installment?.phase?.name ?? null,
            phaseCompleted: draft.phaseCompleted,
            collectionStatus: draft.collectionStatus,
            collectionDifficulty: draft.collectionStatus === "DIFFICULT",
            segment,
            remainingAmount: draft.amount,
            plannedAmount: Math.round(draft.row.amount * scale * 100) / 100,
            allocatedAmount: Math.round(draft.row.allocatedAmount * scale * 100) / 100,
          });
        }
      }
    }

    for (const deposit of contract.deposits) {
      const outstanding = depositOutstandingAmount(Number(deposit.amount), deposit.recoveries);
      if (outstanding <= 0.01) continue;
      depositAmount += outstanding;
      lines.push({
        ...pushBase,
        installmentId: null,
        depositId: deposit.id,
        lineKind: "deposit",
        periodNumber: null,
        condition: deposit.recoverCondition,
        dueAt: null,
        phaseId: null,
        phaseName: null,
        phaseCompleted: false,
        collectionStatus: "NOT_STARTED",
        collectionDifficulty: false,
        segment: "deposit",
        remainingAmount: outstanding,
        plannedAmount: Number(deposit.amount),
        allocatedAmount: Math.round((Number(deposit.amount) - outstanding) * 100) / 100,
      });
    }
  }

  const totalRemaining =
    Math.round(
      (readyAmount + difficultAmount + pendingAmount + awaitingAmount + depositAmount) * 100
    ) / 100;

  const contractTotals = new Map<string, number>();
  for (const line of lines) {
    contractTotals.set(
      line.contractId,
      (contractTotals.get(line.contractId) ?? 0) + line.remainingAmount
    );
  }
  lines.sort((a, b) => {
    const totalDiff =
      (contractTotals.get(b.contractId) ?? 0) - (contractTotals.get(a.contractId) ?? 0);
    if (totalDiff !== 0) return totalDiff;
    if (a.contractId !== b.contractId) return a.contractId.localeCompare(b.contractId);
    // 先分期后保证金
    if (a.lineKind !== b.lineKind) {
      return a.lineKind === "installment" ? -1 : 1;
    }
    return (a.periodNumber ?? 0) - (b.periodNumber ?? 0);
  });

  return {
    totalRemaining,
    readyAmount: Math.round(readyAmount * 100) / 100,
    difficultAmount: Math.round(difficultAmount * 100) / 100,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    awaitingAmount: Math.round(awaitingAmount * 100) / 100,
    depositAmount: Math.round(depositAmount * 100) / 100,
    lines,
  };
}
