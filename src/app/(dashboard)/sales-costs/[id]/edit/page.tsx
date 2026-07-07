import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesCostForm } from "@/components/sales-costs/sales-cost-form";
import { listPresalesUsersForCost, listSalesUsersForCost, updateSalesCost } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditSalesCostPage({ params }: Props) {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const { id } = await params;

  const [cost, salesUsers, presalesUsers] = await Promise.all([
    prisma.salesCost.findUnique({
      where: { id },
      include: { customer: { select: { name: true } } },
    }),
    listSalesUsersForCost(),
    listPresalesUsersForCost(),
  ]);

  if (!cost) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">编辑销售成本</h1>
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
            costId={cost.id}
            salesUsers={salesUsers}
            presalesUsers={presalesUsers}
            submitAction={updateSalesCost}
            defaultValues={{
              costType: cost.costType,
              salesUserId: cost.salesUserId,
              costDate: cost.costDate.toISOString().slice(0, 10),
              description: cost.description ?? undefined,
              customerId: cost.customerId ?? undefined,
              customerName: cost.customer?.name,
              totalAmount: Number(cost.totalAmount),
              presalesUserId: cost.presalesUserId ?? undefined,
              presalesDays: cost.presalesDays ?? undefined,
              accommodation: Number(cost.accommodation ?? 0),
              transportation: Number(cost.transportation ?? 0),
              meals: Number(cost.meals ?? 0),
              otherTravel: Number(cost.otherTravel ?? 0),
              accommodationNote: cost.accommodationNote ?? undefined,
              transportationNote: cost.transportationNote ?? undefined,
              mealsNote: cost.mealsNote ?? undefined,
              otherTravelNote: cost.otherTravelNote ?? undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
