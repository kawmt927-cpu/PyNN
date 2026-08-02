import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageOpportunityOwner,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { canEditContract } from "@/lib/contracts/access";
import { canSignOpportunity } from "@/lib/opportunities/status";
import { ContractForm } from "@/components/contracts/contract-form";
import { BackLink } from "@/components/navigation/back-link";
import { selfReturnPath } from "@/lib/navigation/return-to";
import { getConfigOptions, CONFIG_CATEGORY } from "@/lib/config-options";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CreateContractFromOpportunityPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  if (!canEditContract(session.user.role)) {
    redirect(`/opportunities/${id}`);
  }
  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id);
  if (!opportunity) notFound();

  const full = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      parties: {
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!full || !canSignOpportunity(full.status)) notFound();

  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [salesUsers, paymentMethods, internalCostNames, externalCostNames] = await Promise.all([
    listSalesUsersForSelect({
      viewer: { id: session.user.id, role: session.user.role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
      includeUserIds: [full.ownerId],
    }),
    getConfigOptions(CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD),
    getConfigOptions(CONFIG_CATEGORY.INTERNAL_COST_PRODUCT),
    getConfigOptions(CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT),
  ]);

  const detailHref = selfReturnPath(`/opportunities/${id}`, query);
  const presetCustomerId = full.customerId ?? full.parties[0]?.customerId ?? "";
  const presetCustomerName =
    full.customer?.name ?? full.parties[0]?.customer.name ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {full.status === "SIGNED" ? "再建合同（拆分）" : "创建合同"}
          </h1>
          <p className="text-sm text-muted-foreground">
            来自商机：{full.title}
            {full.status === "SIGNED" && " · 同一商机可关联多份合同"}
          </p>
        </div>
        <BackLink href={detailHref} />
      </div>

      <ContractForm
        opportunityId={id}
        opportunityTitle={full.title}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        currentUserId={session.user.id}
        paymentMethodOptions={paymentMethods.map((o) => ({ value: o.value, label: o.label }))}
        internalCostNameOptions={internalCostNames.map((o) => ({ value: o.value, label: o.label }))}
        externalCostNameOptions={externalCostNames.map((o) => ({ value: o.value, label: o.label }))}
        initialParties={full.parties.map((p) => ({
          key: p.id,
          customerId: p.customerId,
          customerName: p.customer.name,
          role: p.role,
          note: p.note ?? "",
        }))}
        defaultValues={{
          title: full.title,
          totalAmount: Number(full.expectedAmount),
          signCustomerId: presetCustomerId,
          signCustomerName: presetCustomerName,
          endUserCustomerId: presetCustomerId,
          endUserCustomerName: presetCustomerName,
          ownerId: full.ownerId,
          ourRepresentativeId: session.user.id,
        }}
        submitLabel="提交销售合同"
      />
    </div>
  );
}
