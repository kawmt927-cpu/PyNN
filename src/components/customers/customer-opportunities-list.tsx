import Link from "next/link";
import { Button } from "@/components/ui/button";
import { labelForConfig } from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import { withReturnTo } from "@/lib/navigation/return-to";
import type { OpportunityStatus } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

export type CustomerOpportunityRow = {
  id: string;
  title: string;
  stage: string;
  status: OpportunityStatus;
  expectedAmount: Decimal;
  expectedCloseDate: Date;
  owner: { name: string };
};

type Props = {
  opportunities: CustomerOpportunityRow[];
  stageLabels: Record<string, string>;
  linkReturnTo?: string;
};

export function CustomerOpportunitiesList({
  opportunities,
  stageLabels,
  linkReturnTo,
}: Props) {
  const href = (id: string) =>
    linkReturnTo ? withReturnTo(`/opportunities/${id}`, linkReturnTo) : `/opportunities/${id}`;

  if (opportunities.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无商机</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">商机名称</th>
            <th className="pb-2 pr-4">阶段</th>
            <th className="pb-2 pr-4">状态</th>
            <th className="pb-2 pr-4">预计金额</th>
            <th className="pb-2 pr-4">预计签约</th>
            <th className="pb-2 pr-4">负责人</th>
            <th className="pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium">
                <Link href={href(row.id)} className="text-primary hover:underline">
                  {row.title}
                </Link>
              </td>
              <td className="py-3 pr-4">{labelForConfig(stageLabels, row.stage)}</td>
              <td className="py-3 pr-4">{OPPORTUNITY_STATUS_LABELS[row.status]}</td>
              <td className="py-3 pr-4">{formatAmount(row.expectedAmount)}</td>
              <td className="py-3 pr-4">{formatExpectedCloseMonth(row.expectedCloseDate)}</td>
              <td className="py-3 pr-4">{row.owner.name}</td>
              <td className="py-3">
                <Button asChild variant="ghost" size="sm">
                  <Link href={href(row.id)}>查看</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
