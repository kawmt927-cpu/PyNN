import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesCostListFilters } from "@/components/sales-costs/sales-cost-list-filters";
import { SalesCostListTable } from "@/components/sales-costs/sales-cost-list-table";
import { serializeSalesCostForList } from "@/lib/sales-costs/serialize";
import {
  buildSalesCostListWhere,
  parseSalesCostListFilters,
} from "@/lib/sales-costs/list-filters";
import { deleteSalesCostById } from "./actions";
import { formatAmount } from "@/lib/opportunities/funnel";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SalesCostsPage({ searchParams }: Props) {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const params = await searchParams;
  const filters = parseSalesCostListFilters(params);
  const where = buildSalesCostListWhere(filters);

  const [costs, salesUsers, aggregate] = await Promise.all([
    prisma.salesCost.findMany({
      where,
      orderBy: { costDate: "desc" },
      include: {
        salesUser: { select: { name: true } },
        recordedBy: { select: { name: true } },
        customer: { select: { name: true } },
        presalesUser: { select: { name: true } },
      },
      take: 200,
    }),
    prisma.user.findMany({
      where: { personnelProfile: { staffCategory: "SALES", enabled: true } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.salesCost.aggregate({ where, _sum: { totalAmount: true } }),
  ]);

  const total = Number(aggregate._sum.totalAmount ?? 0);
  const listItems = costs.map(serializeSalesCostForList);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">销售成本</h1>
        <Button asChild>
          <Link href="/sales-costs/new">录入成本</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">加载筛选…</p>}>
            <SalesCostListFilters salesUsers={salesUsers} />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            成本记录
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({listItems.length} 条，合计 {formatAmount(total)})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listItems.length === 0 ? (
            <p className="text-muted-foreground">暂无记录。</p>
          ) : (
            <SalesCostListTable items={listItems} deleteAction={deleteSalesCostById} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
