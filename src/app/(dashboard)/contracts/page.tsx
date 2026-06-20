import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { contractListWhere } from "@/lib/opportunities/access";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ContractsPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"]);
  const where = contractListWhere(session.user.role, session.user.id);

  const contracts = await prisma.contract.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      signCustomer: { select: { name: true } },
      endUserCustomer: { select: { name: true } },
      owner: { select: { name: true } },
      opportunity: { select: { id: true, title: true } },
      project: { select: { id: true } },
    },
    take: 100,
  });

  const listPath = "/contracts";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">合同管理</h1>
        {session.user.role !== "PROJECT_MANAGER" && (
          <Button asChild>
            <Link href="/contracts/new">新建合同</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            合同列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({contracts.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-muted-foreground">暂无合同。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">合同标题</th>
                    <th className="pb-2 pr-4">签约客户</th>
                    <th className="pb-2 pr-4">终用户</th>
                    <th className="pb-2 pr-4">金额</th>
                    <th className="pb-2 pr-4">状态</th>
                    <th className="pb-2 pr-4">负责销售</th>
                    <th className="pb-2 pr-4">关联商机</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">{c.title}</td>
                      <td className="py-3 pr-4">{c.signCustomer.name}</td>
                      <td className="py-3 pr-4">{c.endUserCustomer.name}</td>
                      <td className="py-3 pr-4">{formatAmount(c.totalAmount)}</td>
                      <td className="py-3 pr-4">{CONTRACT_STATUS_LABELS[c.status]}</td>
                      <td className="py-3 pr-4">{c.owner.name}</td>
                      <td className="py-3 pr-4">
                        {c.opportunity ? (
                          <Link
                            href={withReturnTo(`/opportunities/${c.opportunity.id}`, listPath)}
                            className="text-primary hover:underline"
                          >
                            {c.opportunity.title}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3">
                        <Link
                          href={withReturnTo(`/contracts/${c.id}`, listPath)}
                          className="text-primary hover:underline"
                        >
                          详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
