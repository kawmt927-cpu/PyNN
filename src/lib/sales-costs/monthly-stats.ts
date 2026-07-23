import type { SalesCostType } from "@prisma/client";
import type { MonthlyCostStat } from "@/components/sales-costs/sales-cost-monthly-summary";

type CostRow = {
  costDate: Date;
  costType: SalesCostType;
  totalAmount: { toString(): string } | number;
};

/** 按年-月汇总销售成本（用于差旅等月度统计） */
export function buildSalesCostMonthlyStats(rows: CostRow[]): MonthlyCostStat[] {
  const map = new Map<string, MonthlyCostStat>();

  for (const row of rows) {
    const d = new Date(row.costDate);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${month}`;
    const amount = Number(row.totalAmount);
    const current = map.get(key) ?? {
      year,
      month,
      total: 0,
      byType: {},
      count: 0,
    };
    current.total += amount;
    current.count += 1;
    current.byType[row.costType] = (current.byType[row.costType] ?? 0) + amount;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.month - a.month
  );
}
