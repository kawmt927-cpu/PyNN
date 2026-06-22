import { prisma } from "@/lib/prisma";

export async function sumContractPaymentsForOwner(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const rows = await prisma.contractPaymentRecord.aggregate({
    where: {
      paidAt: { gte: start, lt: end },
      contract: { ownerId: userId },
    },
    _sum: { amount: true },
  });
  return Number(rows._sum.amount ?? 0);
}
