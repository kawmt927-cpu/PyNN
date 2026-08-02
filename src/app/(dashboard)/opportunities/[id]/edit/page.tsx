import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageOpportunityOwner,
  canEditOpportunityContent,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { loadOpportunityFormOptions, loadCustomerFormOptions } from "@/lib/config-options";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { BackLink } from "@/components/navigation/back-link";
import { selfReturnPath } from "@/lib/navigation/return-to";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function EditOpportunityPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id);
  if (!opportunity) notFound();

  const full = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      customer: { select: { name: true } },
      parties: {
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!full) notFound();
  if (full.status === "ABANDONED") notFound();
  if (!canEditOpportunityContent(session.user.role, session.user.id, full)) notFound();

  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [opportunityFormOptions, customerFormOptions, salesUsers] = await Promise.all([
    loadOpportunityFormOptions(),
    loadCustomerFormOptions(),
    listSalesUsersForSelect({
      viewer: { id: session.user.id, role: session.user.role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
      includeUserIds: [full.ownerId],
    }),
  ]);

  const detailHref = selfReturnPath(`/opportunities/${id}`, query);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">编辑商机</h1>
        <BackLink href={detailHref} />
      </div>

      <OpportunityForm
        mode="edit"
        opportunityId={id}
        submitLabel="保存"
        currentUser={{ id: session.user.id, name: session.user.name }}
        readOnlyOwner={
          showOwnerSelect ? undefined : { id: full.owner.id, name: full.owner.name }
        }
        initialCustomerName={full.customer?.name}
        stageOptions={opportunityFormOptions.stageOptions}
        opportunityGradeOptions={opportunityFormOptions.gradeOptions}
        sourceOptions={customerFormOptions.sourceOptions}
        typeOptions={customerFormOptions.typeOptions}
        gradeOptions={customerFormOptions.gradeOptions}
        channelGradeOptions={customerFormOptions.channelGradeOptions}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        initialParties={full.parties.map((p) => ({
          key: p.id,
          customerId: p.customerId,
          customerName: p.customer.name,
          role: p.role,
          note: p.note ?? "",
        }))}
        initial={{
          title: full.title,
          customerId: full.customerId ?? "",
          expectedAmount: Number(full.expectedAmount),
          expectedCloseDate: full.expectedCloseDate.toISOString(),
          stage: full.stage,
          grade: full.grade || "P3",
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
