import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageOpportunityOwner,
  canEditOpportunityContent,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { CONFIG_CATEGORY, getConfigOptions, loadCustomerFormOptions } from "@/lib/config-options";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { Button } from "@/components/ui/button";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditOpportunityPage({ params }: Props) {
  const { id } = await params;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id);
  if (!opportunity) notFound();

  const full = await prisma.opportunity.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!full) notFound();
  if (full.status === "ABANDONED") notFound();
  if (!canEditOpportunityContent(session.user.role, session.user.id, full)) notFound();

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
        <h1 className="text-2xl font-bold">编辑商机</h1>
        <Button asChild variant="outline">
          <Link href={`/opportunities/${id}`}>返回详情</Link>
        </Button>
      </div>

      <OpportunityForm
        mode="edit"
        opportunityId={id}
        submitLabel="保存"
        currentUser={{ id: session.user.id, name: session.user.name }}
        readOnlyOwner={
          showOwnerSelect ? undefined : { id: full.owner.id, name: full.owner.name }
        }
        customers={customers}
        stageOptions={stageOptions}
        sourceOptions={customerFormOptions.sourceOptions}
        typeOptions={customerFormOptions.typeOptions}
        gradeOptions={customerFormOptions.gradeOptions}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        initial={{
          title: full.title,
          customerId: full.customerId,
          expectedAmount: Number(full.expectedAmount),
          expectedCloseDate: full.expectedCloseDate.toISOString(),
          stage: full.stage,
          requirementDesc: full.requirementDesc,
          winProbability: full.winProbability,
          competitor: full.competitor,
          notes: full.notes,
          ownerId: full.ownerId,
          amountLocked: full.amountLocked,
        }}
      />
    </div>
  );
}
