import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageOpportunityOwner,
} from "@/lib/opportunities/access";
import { CONFIG_CATEGORY, getConfigOptions, loadCustomerFormOptions } from "@/lib/config-options";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { BackLink } from "@/components/navigation/back-link";
import { resolveBackNavigation } from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function NewOpportunityPage({ searchParams }: Props) {
  const query = await searchParams;
  const { backHref, backLabel } = resolveBackNavigation(query, "/opportunities");
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [stageOptions, customerFormOptions, salesUsers] = await Promise.all([
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
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
      />
    </div>
  );
}
