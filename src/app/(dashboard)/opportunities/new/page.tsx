import { requireRole } from "@/lib/session";
import {
  canManageOpportunityOwner,
} from "@/lib/opportunities/access";
import { getCustomerForUser } from "@/lib/customers/access";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import { CONFIG_CATEGORY, getConfigOptions, loadCustomerFormOptions } from "@/lib/config-options";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { BackLink } from "@/components/navigation/back-link";
import { resolveBackNavigation } from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{ returnTo?: string; customerId?: string }>;
};

export default async function NewOpportunityPage({ searchParams }: Props) {
  const query = await searchParams;
  const { backHref, backLabel } = resolveBackNavigation(query, "/opportunities");
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const presetCustomerId = query.customerId?.trim();
  const presetCustomer = presetCustomerId
    ? await getCustomerForUser(presetCustomerId, session.user.role, session.user.id)
    : null;

  const [stageOptions, customerFormOptions, salesUsers] = await Promise.all([
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    loadCustomerFormOptions(),
    listSalesUsersForSelect({
      viewer: { id: session.user.id, role: session.user.role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新建商机</h1>
        <BackLink href={backHref} label={backLabel} />
      </div>

      <OpportunityForm
        mode="create"
        submitLabel="创建商机"
        currentUser={{ id: session.user.id, name: session.user.name }}
        stageOptions={stageOptions}
        sourceOptions={customerFormOptions.sourceOptions}
        typeOptions={customerFormOptions.typeOptions}
        gradeOptions={customerFormOptions.gradeOptions}
        channelGradeOptions={customerFormOptions.channelGradeOptions}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        initial={presetCustomer ? { customerId: presetCustomer.id } : undefined}
        initialCustomerName={presetCustomer?.name}
      />
    </div>
  );
}
