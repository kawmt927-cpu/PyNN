import { prisma } from "@/lib/prisma";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
} from "@/lib/contracts/payment-waterfall";
import {
  shouldAutoInCollection,
  shouldPromoteToReadyOnPhaseComplete,
} from "@/lib/contracts/installment-collection-status";

export type PromotedInstallmentRow = {
  id: string;
  periodNumber: number;
  amount: number;
  condition: string | null;
};

/** 阶段完成后：绑定该阶段且仍为「未开始」的分期 → 可催款；返回本次提升的分期 */
export async function promoteInstallmentsOnPhaseCompleted(
  phaseId: string
): Promise<PromotedInstallmentRow[]> {
  const rows = await prisma.paymentInstallment.findMany({
    where: { phaseId },
    select: {
      id: true,
      periodNumber: true,
      amount: true,
      condition: true,
      collectionStatus: true,
    },
  });
  const promoted = rows
    .filter((row) => shouldPromoteToReadyOnPhaseComplete(row.collectionStatus))
    .map((row) => ({
      id: row.id,
      periodNumber: row.periodNumber,
      amount: Number(row.amount),
      condition: row.condition,
    }));
  if (promoted.length === 0) return [];
  await prisma.paymentInstallment.updateMany({
    where: { id: { in: promoted.map((row) => row.id) } },
    data: { collectionStatus: "READY" },
  });
  return promoted;
}

/** 绑定阶段时若阶段已完成且分期仍为未开始 → 可催款 */
export async function promoteInstallmentIfPhaseAlreadyCompleted(input: {
  installmentId: string;
  phaseId: string | null;
}) {
  if (!input.phaseId) return;
  const phase = await prisma.projectPhase.findUnique({
    where: { id: input.phaseId },
    select: { status: true },
  });
  if (phase?.status !== "COMPLETED") return;
  const row = await prisma.paymentInstallment.findUnique({
    where: { id: input.installmentId },
    select: { collectionStatus: true },
  });
  if (!row || !shouldPromoteToReadyOnPhaseComplete(row.collectionStatus)) return;
  await prisma.paymentInstallment.update({
    where: { id: input.installmentId },
    data: { collectionStatus: "READY" },
  });
}

/** 回款变动后：未开始且已有部分回款 → 回款中 */
export async function syncInstallmentCollectionAfterPayments(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      paymentRecords: { select: { amount: true } },
      installments: {
        orderBy: { periodNumber: "asc" },
        select: {
          id: true,
          periodNumber: true,
          amount: true,
          condition: true,
          collectionStatus: true,
        },
      },
    },
  });
  if (!contract || contract.installments.length === 0) return;

  const paid = sumPaymentRecords(contract.paymentRecords);
  const waterfall = allocatePaymentsWaterfall(
    paid,
    contract.installments.map((row) => ({
      id: row.id,
      periodNumber: row.periodNumber,
      amount: Number(row.amount),
      condition: row.condition,
    }))
  );

  const toInCollection: string[] = [];
  for (const row of waterfall) {
    const installment = contract.installments.find((item) => item.id === row.id);
    if (!installment) continue;
    if (
      shouldAutoInCollection({
        percentComplete: row.percentComplete,
        collectionStatus: installment.collectionStatus,
      })
    ) {
      toInCollection.push(row.id);
    }
  }

  if (toInCollection.length === 0) return;
  await prisma.paymentInstallment.updateMany({
    where: { id: { in: toInCollection } },
    data: { collectionStatus: "IN_COLLECTION" },
  });
}
