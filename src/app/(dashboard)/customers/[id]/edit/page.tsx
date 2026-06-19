import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getCustomerForUser, canManageCustomerOwner } from "@/lib/customers/access";
import { loadCustomerFormOptions } from "@/lib/config-options";
import { CustomerForm } from "@/components/customers/customer-form";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerEditPage({ params }: Props) {
  const { id } = await params;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const customer = await getCustomerForUser(id, session.user.role, session.user.id);

  if (!customer) notFound();

  const showOwnerSelect = canManageCustomerOwner(session.user.role);
  const salesUsers = showOwnerSelect
    ? await prisma.user.findMany({
        where: { role: { in: ["SALES", "SALES_MANAGER"] } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const { sourceOptions, typeOptions, gradeOptions } = await loadCustomerFormOptions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">编辑客户</h1>
        <Button asChild variant="outline">
          <Link href={`/customers/${id}`}>取消</Link>
        </Button>
      </div>
      <CustomerForm
        mode="edit"
        customerId={id}
        submitLabel="保存修改"
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        sourceOptions={sourceOptions}
        typeOptions={typeOptions}
        gradeOptions={gradeOptions}
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
        }}
      />
    </div>
  );
}
