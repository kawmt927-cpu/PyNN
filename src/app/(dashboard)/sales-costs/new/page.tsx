import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesCostForm } from "@/components/sales-costs/sales-cost-form";
import { createSalesCost, listPresalesUsersForCost, listSalesUsersForCost } from "../actions";

export default async function NewSalesCostPage() {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const [salesUsers, presalesUsers] = await Promise.all([
    listSalesUsersForCost(),
    listPresalesUsersForCost(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">录入销售成本</h1>
        <Button asChild variant="outline">
          <Link href="/sales-costs">返回列表</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>费用信息</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesCostForm
            salesUsers={salesUsers}
            presalesUsers={presalesUsers}
            submitAction={createSalesCost}
          />
        </CardContent>
      </Card>
    </div>
  );
}
