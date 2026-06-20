import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageOpportunityOwner,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { canSignOpportunity } from "@/lib/opportunities/status";
import { ContractForm } from "@/components/contracts/contract-form";
import { Button } from "@/components/ui/button";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CreateContractFromOpportunityPage({ params }: Props) {
  const { id } = await params;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id);
  if (!opportunity) notFound();

  const full = await prisma.opportunity.findUnique({
    where: { id },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (!full || !canSignOpportunity(full.status)) notFound();

  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [customers, salesUsers] = await Promise.all([
    prisma.customer.findMany({
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
        <div>
          <h1 className="text-2xl font-bold">创建合同</h1>
          <p className="text-sm text-muted-foreground">来自商机：{full.title}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/opportunities/${id}`}>返回商机</Link>
        </Button>
      </div>

      <ContractForm
        opportunityId={id}
        customers={customers}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        defaultValues={{
          title: full.title,
          totalAmount: Number(full.expectedAmount),
          signCustomerId: full.customerId,
          endUserCustomerId: full.customerId,
          ownerId: full.ownerId,
        }}
        submitLabel="创建合同并生成项目"
      />
    </div>
  );
}
