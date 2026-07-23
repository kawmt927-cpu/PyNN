import { nextClientKey } from "@/lib/ui/stable-client-key";

export type PaymentPlanSourceRow = {
  periodNumber: number;
  amount: number;
  condition?: string | null;
  dueAt?: string | null;
};

export type ExternalCostPlanRow = {
  key: string;
  periodNumber: number;
  amount: string;
  condition: string;
  dueAt: string;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function newKey() {
  return nextClientKey("ext-sync");
}

/** 等比背靠背：结构跟回款计划一致，金额按外部总额占比拆分 */
export function buildProportionalExternalPlan(
  externalTotal: number,
  contractTotal: number,
  paymentPlan: PaymentPlanSourceRow[]
): ExternalCostPlanRow[] {
  if (!paymentPlan.length || externalTotal <= 0 || contractTotal <= 0) return [];

  const rows = paymentPlan
    .slice()
    .sort((a, b) => a.periodNumber - b.periodNumber)
    .map((row) => {
      const amount = roundMoney((externalTotal * row.amount) / contractTotal);
      return {
        key: newKey(),
        periodNumber: row.periodNumber,
        amount: amount.toFixed(2),
        condition: row.condition?.trim() ?? "",
        dueAt: row.dueAt?.slice(0, 10) ?? "",
      };
    });

  // 尾差调到最后一期，保证合计精确
  const sum = rows.reduce((acc, row) => acc + Number(row.amount), 0);
  const gap = roundMoney(externalTotal - sum);
  if (rows.length > 0 && Math.abs(gap) >= 0.01) {
    const last = rows[rows.length - 1];
    last.amount = roundMoney(Number(last.amount) + gap).toFixed(2);
  }
  return rows;
}

export function sumExternalPlanAmounts(rows: Array<{ amount: string | number }>) {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}
