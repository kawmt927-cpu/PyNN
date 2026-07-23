import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import {
  getCustomerForUser,
  canManageCustomerOwner,
  canEditCustomerContent,
  listCustomerAssignableUsers,
} from "@/lib/customers/access";
import { customerExists } from "@/lib/customers/access-denied";
import { loadCustomerFormOptions } from "@/lib/config-options";
import { CustomerForm } from "@/components/customers/customer-form";
import { BackLink } from "@/components/navigation/back-link";
import { AccessDeniedCard } from "@/components/navigation/access-denied-card";
import { resolveBackNavigation, selfReturnPath } from "@/lib/navigation/return-to";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CustomerEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  // 先归一关系类型 value（历史「渠道」可能不是 CHANNEL），再读客户
  const { sourceOptions, typeOptions, gradeOptions, channelGradeOptions, tagOptions } =
    await loadCustomerFormOptions();

  if (!(await customerExists(id))) notFound();

  const customer = await getCustomerForUser(id, session.user.role, session.user.id);
  const { backHref, backLabel } = resolveBackNavigation(query, `/customers/${id}`);

  if (!customer) {
    return (
      <div className="space-y-4">
        <AccessDeniedCard backHref={backHref} backLabel={backLabel} entityLabel="该客户" />
      </div>
    );
  }
  if (!canEditCustomerContent(session.user.role, session.user.id, customer)) {
    return (
      <div className="space-y-4">
        <AccessDeniedCard
          backHref={backHref}
          backLabel={backLabel}
          entityLabel="该客户（无编辑权限）"
        />
      </div>
    );
  }

  const showOwnerSelect = canManageCustomerOwner(session.user.role);
  const showAssistantOwnersSelect =
    showOwnerSelect || customer.ownerId === session.user.id;
  const salesUsers =
    showOwnerSelect || showAssistantOwnersSelect
      ? await listCustomerAssignableUsers({
          includeUserIds: [
            customer.ownerId,
            ...customer.assistantOwners.map((a) => a.userId),
          ].filter((id): id is string => Boolean(id)),
        })
      : [];

  const initialTagValues = customer.tags.map((item) => item.tagValue);

  const detailHref = selfReturnPath(`/customers/${id}`, query);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">编辑客户</h1>
        <BackLink href={detailHref} />
      </div>
      <CustomerForm
        mode="edit"
        customerId={id}
        submitLabel="保存修改"
        showOwnerSelect={showOwnerSelect}
        showAssistantOwnersSelect={showAssistantOwnersSelect}
        salesUsers={salesUsers}
        sourceOptions={sourceOptions}
        typeOptions={typeOptions}
        gradeOptions={gradeOptions}
        channelGradeOptions={channelGradeOptions}
        tagOptions={tagOptions}
        initialTagValues={initialTagValues}
        initial={{
          name: customer.name,
          category: customer.category,
          hospitalLevel: customer.hospitalLevel,
          province: customer.province,
          city: customer.city,
          district: customer.district,
          bedCount: customer.bedCount,
          existingSystem: customer.existingSystem,
          source: customer.source,
          customerType: customer.customerType,
          customerGrade: customer.customerGrade,
          notes: customer.notes,
          ownerId: customer.ownerId,
          assistantOwnerIds: customer.assistantOwners.map((row) => row.userId),
        }}
      />
    </div>
  );
}
