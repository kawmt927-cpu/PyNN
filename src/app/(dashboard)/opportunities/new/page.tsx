import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageOpportunityOwner,
} from "@/lib/opportunities/access";
import { CONFIG_CATEGORY, getConfigOptions, loadCustomerFormOptions } from "@/lib/config-options";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { Button } from "@/components/ui/button";

export default async function NewOpportunityPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [customers, stageOptions, customerFormOptions, salesUsers] = await Promise.all([
    prisma.customer.findMany({
      where: session.user.role === "SALES" ? { ownerId: session.user.id } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    loadCustomerFormOptions(),
    showOwnerSelect
      ? prisma.user.findMany({
          where: { role: { in: ["SALES", "SALES_MANAGER"] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新建商机</h1>
        <Button asChild variant="outline">
          <Link href="/opportunities">返回列表</Link>
        </Button>
      </div>

      <OpportunityForm
        mode="create"
        submitLabel="创建商机"
        currentUser={{ id: session.user.id, name: session.user.name }}
        customers={customers}
        stageOptions={stageOptions}
        sourceOptions={customerFormOptions.sourceOptions}
        typeOptions={customerFormOptions.typeOptions}
        gradeOptions={customerFormOptions.gradeOptions}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
      />
    </div>
  );
}
