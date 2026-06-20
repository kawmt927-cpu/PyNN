import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageOpportunityOwner } from "@/lib/opportunities/access";
import { ContractForm } from "@/components/contracts/contract-form";
import { Button } from "@/components/ui/button";

export default async function NewContractPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [customers, salesUsers] = await Promise.all([
    prisma.customer.findMany({
      where: session.user.role === "SALES" ? { ownerId: session.user.id } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
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
        <h1 className="text-2xl font-bold">新建合同</h1>
        <Button asChild variant="outline">
          <Link href="/contracts">返回列表</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        可直接创建合同，无需关联商机；保存后将自动创建对应项目。
      </p>

      <ContractForm
        customers={customers}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        submitLabel="创建合同并生成项目"
      />
    </div>
  );
}
