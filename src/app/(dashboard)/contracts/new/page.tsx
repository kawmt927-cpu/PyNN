import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageOpportunityOwner } from "@/lib/opportunities/access";
import { getCustomerForUser } from "@/lib/customers/access";
import { ContractForm } from "@/components/contracts/contract-form";
import { BackLink } from "@/components/navigation/back-link";
import { resolveBackNavigation } from "@/lib/navigation/return-to";
import { getConfigOptions, CONFIG_CATEGORY } from "@/lib/config-options";

type Props = {
  searchParams: Promise<{ returnTo?: string; customerId?: string }>;
};

export default async function NewContractPage({ searchParams }: Props) {
  const query = await searchParams;
  const { backHref, backLabel } = resolveBackNavigation(query, "/contracts");
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const presetCustomerId = query.customerId?.trim();
  const presetCustomer = presetCustomerId
    ? await getCustomerForUser(presetCustomerId, session.user.role, session.user.id)
    : null;

  const [salesUsers, paymentMethods] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["SALES", "SALES_MANAGER", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getConfigOptions(CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新建合同</h1>
        <BackLink href={backHref} label={backLabel} />
      </div>

      <p className="text-sm text-muted-foreground">
        销售提交后需销售管理审核；销售管理/管理员提交后直接签署并创建项目。
      </p>

      <ContractForm
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        currentUserId={session.user.id}
        paymentMethodOptions={paymentMethods.map((o) => ({ value: o.value, label: o.label }))}
        submitLabel="提交销售合同"
        defaultValues={
          presetCustomer
            ? {
                signCustomerId: presetCustomer.id,
                signCustomerName: presetCustomer.name,
                endUserCustomerId: presetCustomer.id,
                endUserCustomerName: presetCustomer.name,
              }
            : undefined
        }
      />
    </div>
  );
}
