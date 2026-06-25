import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageCustomerOwner } from "@/lib/customers/access";
import { loadCustomerFormOptions } from "@/lib/config-options";
import { CustomerForm } from "@/components/customers/customer-form";
import { BackLink } from "@/components/navigation/back-link";
import { resolveBackNavigation } from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CustomersNewPage({ searchParams }: Props) {
  const query = await searchParams;
  const { backHref, backLabel } = resolveBackNavigation(query, "/customers");
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const showOwnerSelect = canManageCustomerOwner(session.user.role);

  const salesUsers =
    showOwnerSelect || session.user.role === "SALES"
      ? await prisma.user.findMany({
          where: {
            role: { in: ["SALES", "SALES_MANAGER"] },
            personnelProfile: { enabled: true },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  const { sourceOptions, typeOptions, gradeOptions, tagOptions } = await loadCustomerFormOptions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新增客户</h1>
        <BackLink href={backHref} label={backLabel} />
      </div>
      <CustomerForm
        mode="create"
        submitLabel="创建客户"
        showOwnerSelect={showOwnerSelect}
        showAssistantOwnersSelect={showOwnerSelect || session.user.role === "SALES"}
        salesUsers={salesUsers}
        sourceOptions={sourceOptions}
        typeOptions={typeOptions}
        gradeOptions={gradeOptions}
        tagOptions={tagOptions}
      />
    </div>
  );
}
