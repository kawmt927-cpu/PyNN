import { requireRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { canManageOpportunityOwner } from "@/lib/opportunities/access";
import { canEditContract } from "@/lib/contracts/access";
import { getCustomerForUser } from "@/lib/customers/access";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
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
  if (!canEditContract(session.user.role)) {
    redirect("/contracts");
  }
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const presetCustomerId = query.customerId?.trim();
  const presetCustomer = presetCustomerId
    ? await getCustomerForUser(presetCustomerId, session.user.role, session.user.id)
    : null;

  const [salesUsers, paymentMethods, internalCostNames, externalCostNames] = await Promise.all([
    listSalesUsersForSelect({
      viewer: { id: session.user.id, role: session.user.role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
    }),
    getConfigOptions(CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD),
    getConfigOptions(CONFIG_CATEGORY.INTERNAL_COST_PRODUCT),
    getConfigOptions(CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新建合同</h1>
        <BackLink href={backHref} label={backLabel} />
      </div>

      <p className="text-sm text-muted-foreground">
        销售管理/管理员创建合同后直接签署。项目由管理员或项目管理员在「项目管理」中手动创建。
      </p>

      <ContractForm
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        currentUserId={session.user.id}
        paymentMethodOptions={paymentMethods.map((o) => ({ value: o.value, label: o.label }))}
        internalCostNameOptions={internalCostNames.map((o) => ({ value: o.value, label: o.label }))}
        externalCostNameOptions={externalCostNames.map((o) => ({ value: o.value, label: o.label }))}
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
