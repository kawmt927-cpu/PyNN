import { CONFIG_CATEGORY, labelForConfig } from "@/lib/config-options";
import { formatAmount } from "@/lib/opportunities/funnel";

type Props = {
  rows: Array<{ stage: string; count: number; totalAmount: number | { toString(): string } }>;
  stageLabels: Record<string, string>;
};

export function OpportunityFunnelSummary({ rows, stageLabels }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无进行中商机的漏斗数据。</p>;
  }

  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">阶段</th>
            <th className="pb-2 pr-4">商机数</th>
            <th className="pb-2">预计金额合计</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stage} className="border-b">
              <td className="py-2 pr-4">{labelForConfig(stageLabels, row.stage)}</td>
              <td className="py-2 pr-4">{row.count}</td>
              <td className="py-2">{formatAmount(Number(row.totalAmount))}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="py-2 pr-4">合计</td>
            <td className="py-2 pr-4">{totalCount}</td>
            <td className="py-2">{formatAmount(totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
