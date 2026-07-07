import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import type { ContractStatus } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

export type CustomerContractRow = {
  id: string;
  title: string;
  totalAmount: Decimal;
  status: ContractStatus;
  signedAt: Date | null;
  owner: { name: string };
  opportunity: { id: string; title: string } | null;
  signCustomerId: string;
  endUserCustomerId: string;
};

type Props = {
  contracts: CustomerContractRow[];
  customerId: string;
  linkReturnTo?: string;
};

export function CustomerContractsList({ contracts, customerId, linkReturnTo }: Props) {
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
          {contracts.map((row) => {
            const roles: string[] = [];
            if (row.signCustomerId === customerId) roles.push("签约客户");
            if (row.endUserCustomerId === customerId) roles.push("终用户");

            return (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">
                  <Link href={href(row.id)} className="text-primary hover:underline">
                    {row.title}
                  </Link>
                </td>
                <td className="py-3 pr-4">{roles.join(" / ")}</td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
