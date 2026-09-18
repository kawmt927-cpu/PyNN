import type { Prisma } from "@prisma/client";

type ProductInput = {
  id?: string | null;
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

function productMatchKey(row: {
  productName: string;
  description?: string | null;
  costType: string;
  costAmount: number | { toString(): string };
  productServiceId?: string | null;
}) {
  const costAmount = Number(Number(row.costAmount).toFixed(2));
  const costType = row.costType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
  return [
    costType,
    row.productName.trim(),
    costAmount,
    row.description?.trim() || "",
    row.productServiceId?.trim() || "",
  ].join("\0");
}

function paidTotal(records: Array<{ amount: number | { toString(): string } }>) {
  return records.reduce((sum, item) => sum + Number(item.amount), 0);
}

async function writeExternalInstallments(
  tx: Tx,
  contractProductId: string,
  installments: NonNullable<ProductInput["externalInstallments"]>
) {
  await tx.externalCostInstallment.deleteMany({
    where: { contractProductId },
  });
  if (installments.length === 0) return;
  await tx.externalCostInstallment.createMany({
    data: installments.map((item) => ({
      contractProductId,
      periodNumber: item.periodNumber,
      amount: item.amount,
      condition: item.condition?.trim() || undefined,
      dueAt: item.dueAt ? new Date(item.dueAt) : undefined,
    })),
  });
}

async function createProductRow(tx: Tx, contractId: string, row: ProductInput) {
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

  if (costType === "EXTERNAL") {
    await writeExternalInstallments(tx, created.id, row.externalInstallments ?? []);
  }
  return created;
}

async function applyProductUpdates(
  tx: Tx,
  existingId: string,
  row: ProductInput,
  paid: number
) {
  const costType = row.costType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
  if (paid > 0.01) {
    if (costType !== "EXTERNAL") {
      throw new Error(
        `「${row.productName}」已有实付记录，不能改为内部成本；请先作废或删光实付`
      );
    }
    if (row.costAmount + 0.01 < paid) {
      throw new Error(
        `外部成本「${row.productName}」应付总额不能低于已实付 ${paid.toFixed(2)} 元`
      );
    }
  }

  await tx.contractProduct.update({
    where: { id: existingId },
    data: {
      productServiceId: row.productServiceId || null,
      productName: row.productName.trim(),
      description: row.description?.trim() || null,
      costType,
      costAmount: row.costAmount,
      actualCostPrice: row.costAmount,
      baselineCostPrice: row.costAmount,
    },
  });

  if (costType === "EXTERNAL") {
    await writeExternalInstallments(tx, existingId, row.externalInstallments ?? []);
  } else {
    await tx.externalCostInstallment.deleteMany({ where: { contractProductId: existingId } });
  }
}

/** 重建合同产品行；外部成本同步写入付款分期（仅无实付、可整表替换时使用） */
export async function replaceContractProducts(
  tx: Tx,
  contractId: string,
  products: ProductInput[]
) {
  await tx.contractProduct.deleteMany({ where: { contractId } });
  for (const row of products) {
    await createProductRow(tx, contractId, row);
  }
}

/**
 * 增量同步产品行：
 * - 已作废行：保留不动（表单默认不带出）
 * - 有实付且从构成中移除：作废保留（不物理删除）
 * - 有实付：允许改名/备注，应付不得低于已实付
 * - 无实付：可改可删
 * - 新增：始终允许
 */
export async function syncContractProducts(
  tx: Tx,
  contractId: string,
  products: ProductInput[],
  actorUserId?: string
) {
  const existing = await tx.contractProduct.findMany({
    where: { contractId },
    select: {
      id: true,
      productName: true,
      description: true,
      costType: true,
      costAmount: true,
      productServiceId: true,
      voidedAt: true,
      externalPayoutRecords: { select: { amount: true } },
    },
  });

  const activeExisting = existing.filter((row) => !row.voidedAt);
  const nextSlots = products.map((product) => ({ product, used: false }));
  const existingSlots = activeExisting.map((row) => ({ row, used: false }));

  // 1) 优先按产品 id 匹配（支持有实付时改名）
  for (const next of nextSlots) {
    const id = next.product.id?.trim();
    if (!id) continue;
    const slot = existingSlots.find((item) => !item.used && item.row.id === id);
    if (!slot) continue;
    next.used = true;
    slot.used = true;
    await applyProductUpdates(
      tx,
      slot.row.id,
      next.product,
      paidTotal(slot.row.externalPayoutRecords)
    );
  }

  // 2) 其余按核心字段匹配
  for (const slot of existingSlots) {
    if (slot.used) continue;
    const key = productMatchKey(slot.row);
    const next = nextSlots.find((item) => !item.used && productMatchKey(item.product) === key);
    if (!next) continue;
    next.used = true;
    slot.used = true;
    await applyProductUpdates(
      tx,
      slot.row.id,
      next.product,
      paidTotal(slot.row.externalPayoutRecords)
    );
  }

  // 3) 未匹配的旧行：有实付 → 作废；无实付 → 删除
  const now = new Date();
  for (const slot of existingSlots) {
    if (slot.used) continue;
    const paid = paidTotal(slot.row.externalPayoutRecords);
    if (paid > 0.01) {
      await tx.contractProduct.update({
        where: { id: slot.row.id },
        data: {
          voidedAt: now,
          voidedById: actorUserId || null,
        },
      });
      continue;
    }
    await tx.contractProduct.delete({ where: { id: slot.row.id } });
  }

  // 4) 未匹配的新行创建
  for (const next of nextSlots) {
    if (next.used) continue;
    await createProductRow(tx, contractId, next.product);
  }
}

/**
 * 在不删除产品行的前提下同步外部付款计划（有实付记录时也可调整条件/到期/分期）。
 * 要求产品构成与库内一致，按产品行匹配。
 */
export async function syncExternalCostInstallments(
  tx: Tx,
  contractId: string,
  products: ProductInput[]
) {
  const existing = await tx.contractProduct.findMany({
    where: { contractId, voidedAt: null },
    select: {
      id: true,
      productName: true,
      description: true,
      costType: true,
      costAmount: true,
      productServiceId: true,
      externalPayoutRecords: { select: { amount: true } },
    },
  });

  const byKey = new Map<string, typeof existing>();
  for (const row of existing) {
    const key = productMatchKey(row);
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  for (const row of products) {
    if (row.costType !== "EXTERNAL") continue;
    const key = productMatchKey(row);
    const candidates = byKey.get(key) ?? [];
    const matched = candidates.shift();
    if (!matched) {
      throw new Error(
        `无法匹配外部成本「${row.productName}」以更新付款计划，请刷新后重试`
      );
    }

    const totalPaid = paidTotal(matched.externalPayoutRecords);
    if (row.costAmount + 0.01 < totalPaid) {
      throw new Error(
        `外部成本「${row.productName}」应付总额不能低于已实付 ${totalPaid.toFixed(2)} 元`
      );
    }

    await writeExternalInstallments(tx, matched.id, row.externalInstallments ?? []);
  }
}
