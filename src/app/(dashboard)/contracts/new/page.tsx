import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageOpportunityOwner } from "@/lib/opportunities/access";
import { ContractForm } from "@/components/contracts/contract-form";
import { BackLink } from "@/components/navigation/back-link";
import { resolveBackNavigation } from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function NewContractPage({ searchParams }: Props) {
  const query = await searchParams;
  const { backHref, backLabel } = resolveBackNavigation(query, "/contracts");
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageOpportunityOwner(session.user.role);

  const [salesUsers] = await Promise.all([
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
        <BackLink href={backHref} label={backLabel} />
      </div>

      <p className="text-sm text-muted-foreground">
        可直接创建合同，无需关联商机；保存后将自动创建对应项目。
      </p>

      <ContractForm
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        submitLabel="创建合同并生成项目"
      />
    </div>
  );
}
