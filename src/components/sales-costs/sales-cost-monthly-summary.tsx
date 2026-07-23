import { formatAmount } from "@/lib/opportunities/funnel";
import type { SalesCostType } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type MonthlyCostStat = {
  year: number;
  month: number;
  total: number;
  byType: Partial<Record<SalesCostType, number>>;
  count: number;
};

type Props = {
  year: number;
  month?: number;
  rows: MonthlyCostStat[];
  travelTotal: number;
};

export function SalesCostMonthlySummary({ year, month, rows, travelTotal }: Props) {
  const visible = month ? rows.filter((r) => r.month === month) : rows;
  const yearTotal = visible.reduce((sum, r) => sum + r.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {month ? `${year} 年 ${month} 月` : `${year} 年`}成本月度统计
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">期间合计</p>
            <p className="text-xl font-semibold">{formatAmount(yearTotal)}</p>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">个人差旅合计</p>
            <p className="text-xl font-semibold">{formatAmount(travelTotal)}</p>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">所选期间暂无成本记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">月份</th>
                  <th className="pb-2 pr-3">个人差旅</th>
                  <th className="pb-2 pr-3">售前</th>
                  <th className="pb-2 pr-3">商务</th>
                  <th className="pb-2 pr-3">笔数</th>
                  <th className="pb-2">月合计</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={`${row.year}-${row.month}`} className="border-b">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {row.year}-{String(row.month).padStart(2, "0")}
                    </td>
                    <td className="py-2 pr-3">
                      {formatAmount(row.byType.PERSONAL_TRAVEL ?? 0)}
                    </td>
                    <td className="py-2 pr-3">{formatAmount(row.byType.PRESALES ?? 0)}</td>
                    <td className="py-2 pr-3">{formatAmount(row.byType.BUSINESS ?? 0)}</td>
                    <td className="py-2 pr-3">{row.count}</td>
                    <td className="py-2 font-medium">{formatAmount(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          个人差旅按「费用日期」归属到月汇总；明细仍可在下方列表按日查看。
        </p>
      </CardContent>
    </Card>
  );
}
