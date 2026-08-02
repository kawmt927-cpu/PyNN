import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import type { CustomerLinkedContract } from "@/lib/customers/linked-deals";

type Props = {
  contracts: CustomerLinkedContract[];
  customerId: string;
  linkReturnTo?: string;
};

export function CustomerContractsList({ contracts, linkReturnTo }: Props) {
  const href = (id: string) =>
    linkReturnTo ? withReturnTo(`/contracts/${id}`, linkReturnTo) : `/contracts/${id}`;

  if (contracts.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无合同</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">合同标题</th>
            <th className="pb-2 pr-4">角色</th>
            <th className="pb-2 pr-4">金额</th>
            <th className="pb-2 pr-4">状态</th>
            <th className="pb-2 pr-4">签约日期</th>
            <th className="pb-2 pr-4">负责销售</th>
            <th className="pb-2 pr-4">关联商机</th>
            <th className="pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium">
                <Link href={href(row.id)} className="text-primary hover:underline">
                  {row.title}
                </Link>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {row.relationRoles.length > 0 ? row.relationRoles.join(" / ") : "—"}
              </td>
              <td className="py-3 pr-4">{formatAmount(row.totalAmount)}</td>
              <td className="py-3 pr-4">{CONTRACT_STATUS_LABELS[row.status]}</td>
              <td className="py-3 pr-4">
                {row.signedAt ? row.signedAt.toLocaleDateString("zh-CN") : "—"}
              </td>
              <td className="py-3 pr-4">{row.owner.name}</td>
              <td className="py-3 pr-4">
                {row.opportunity ? (
                  <Link
                    href={
                      linkReturnTo
                        ? withReturnTo(`/opportunities/${row.opportunity.id}`, linkReturnTo)
                        : `/opportunities/${row.opportunity.id}`
                    }
                    className="text-primary hover:underline"
                  >
                    {row.opportunity.title}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
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
