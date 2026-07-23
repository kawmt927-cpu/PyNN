import type { Prisma } from "@prisma/client";

type ProductInput = {
  productServiceId?: string | null;
  productName: string;
  description?: string | null;
  costType: "INTERNAL" | "EXTERNAL";
  costAmount: number;
  externalInstallments?: Array<{
    periodNumber: number;
    amount: number;
    condition?: string | null;
    dueAt?: string | null;
  }>;
};

type Tx = Prisma.TransactionClient;

/** 重建合同产品行；外部成本同步写入付款分期 */
export async function replaceContractProducts(
  tx: Tx,
  contractId: string,
  products: ProductInput[]
) {
  await tx.contractProduct.deleteMany({ where: { contractId } });

  for (const row of products) {
    const costType = row.costType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
    const created = await tx.contractProduct.create({
      data: {
        contractId,
        productServiceId: row.productServiceId || undefined,
        productName: row.productName.trim(),
        description: row.description?.trim() || undefined,
        costType,
        costAmount: row.costAmount,
        actualCostPrice: row.costAmount,
        baselineCostPrice: row.costAmount,
        salesAmount: 0,
      },
    });

    if (costType !== "EXTERNAL") continue;

    const installments = row.externalInstallments ?? [];
    if (installments.length === 0) continue;

    await tx.externalCostInstallment.createMany({
      data: installments.map((item) => ({
        contractProductId: created.id,
        periodNumber: item.periodNumber,
        amount: item.amount,
        condition: item.condition?.trim() || undefined,
        dueAt: item.dueAt ? new Date(item.dueAt) : undefined,
      })),
    });
  }
}
