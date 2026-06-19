import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageCustomerOwner } from "@/lib/customers/access";
import { loadCustomerFormOptions } from "@/lib/config-options";
import { CustomerForm } from "@/components/customers/customer-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function CustomersNewPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
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
        <h1 className="text-2xl font-bold">新增客户</h1>
        <Button asChild variant="outline">
          <Link href="/customers">返回列表</Link>
        </Button>
      </div>
      <CustomerForm
        mode="create"
        submitLabel="创建客户"
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        sourceOptions={sourceOptions}
        typeOptions={typeOptions}
        gradeOptions={gradeOptions}
      />
    </div>
  );
}
