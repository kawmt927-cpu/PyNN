import type { Prisma } from "@prisma/client";

export type DepositInput = {
  id?: string | null;
  amount: number;
  paidOutAt: string;
  recoverCondition?: string | null;
  notes?: string | null;
};

type Tx = Prisma.TransactionClient;

function recoveredTotal(rows: Array<{ amount: number | { toString(): string } }>) {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

/** 新建时写入保证金行 */
export async function replaceContractDeposits(
  tx: Tx,
  contractId: string,
  deposits: DepositInput[]
) {
  await tx.contractDeposit.deleteMany({ where: { contractId } });
  for (const row of deposits) {
    await tx.contractDeposit.create({
      data: {
        contractId,
        amount: row.amount,
        paidOutAt: new Date(row.paidOutAt),
        recoverCondition: row.recoverCondition?.trim() || undefined,
        notes: row.notes?.trim() || undefined,
      },
    });
  }
}

/**
 * 编辑同步：有收回记录的行不可删除，金额不得低于已收回合计。
 */
export async function syncContractDeposits(
  tx: Tx,
  contractId: string,
  deposits: DepositInput[]
) {
  const existing = await tx.contractDeposit.findMany({
    where: { contractId },
    include: { recoveries: { select: { amount: true } } },
  });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keepIds = new Set<string>();

  for (const row of deposits) {
    const recovered = row.id ? recoveredTotal(existingById.get(row.id)?.recoveries ?? []) : 0;
    if (row.amount + 0.01 < recovered) {
      throw new Error(
        `保证金金额不能低于已收回 ${recovered.toFixed(2)} 元`
      );
    }
    if (!row.paidOutAt?.trim()) {
      throw new Error("请填写保证金支出日期");
    }

    if (row.id && existingById.has(row.id)) {
      keepIds.add(row.id);
      await tx.contractDeposit.update({
        where: { id: row.id },
        data: {
          amount: row.amount,
          paidOutAt: new Date(row.paidOutAt),
          recoverCondition: row.recoverCondition?.trim() || null,
          notes: row.notes?.trim() || null,
        },
      });
    } else {
      const created = await tx.contractDeposit.create({
        data: {
          contractId,
          amount: row.amount,
          paidOutAt: new Date(row.paidOutAt),
          recoverCondition: row.recoverCondition?.trim() || undefined,
          notes: row.notes?.trim() || undefined,
        },
      });
      keepIds.add(created.id);
    }
  }

  for (const row of existing) {
    if (keepIds.has(row.id)) continue;
    if (row.recoveries.length > 0) {
      throw new Error("已有收回记录的保证金不能删除，请先删除收回登记");
    }
    await tx.contractDeposit.delete({ where: { id: row.id } });
  }
}

export function depositOutstandingAmount(
  amount: number,
  recoveries: Array<{ amount: number | { toString(): string } }>
) {
  return Math.max(0, Math.round((amount - recoveredTotal(recoveries)) * 100) / 100);
}
