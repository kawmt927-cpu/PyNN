import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getContractForUser } from "@/lib/opportunities/access";
import { canEditContract } from "@/lib/contracts/access";
import { ContractForm } from "@/components/contracts/contract-form";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { resolveBackNavigation, selfReturnPath } from "@/lib/navigation/return-to";
import { getConfigOptions, CONFIG_CATEGORY } from "@/lib/config-options";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function EditContractPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);

  if (!canEditContract(session.user.role)) notFound();

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      signCustomer: { select: { id: true, name: true } },
      endUserCustomer: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
      products: {
        orderBy: { productName: "asc" },
        include: {
          externalInstallments: { orderBy: { periodNumber: "asc" } },
        },
      },
      installments: { orderBy: { periodNumber: "asc" } },
    },
  });

  if (!contract) notFound();
  const accessible = await getContractForUser(id, session.user.role, session.user.id);
  if (!accessible) notFound();

  const { backHref, backLabel } = resolveBackNavigation(query, `/contracts/${id}`);
  const detailPath = selfReturnPath(`/contracts/${id}`, query);

  const [salesUsers, paymentMethods, internalCostNames, externalCostNames] = await Promise.all([
    listSalesUsersForSelect({
      viewer: { id: session.user.id, role: session.user.role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
      includeUserIds: [contract.ownerId, contract.ourRepresentativeId].filter(Boolean) as string[],
    }),
    getConfigOptions(CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD),
    getConfigOptions(CONFIG_CATEGORY.INTERNAL_COST_PRODUCT),
    getConfigOptions(CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">编辑合同</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.title} · 当前状态：{CONTRACT_STATUS_LABELS[contract.status]}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={detailPath}>取消</Link>
          </Button>
          <BackLink href={backHref} label={backLabel} />
        </div>
      </div>

      <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        编辑不会变更合同审核状态；已签署合同的金额不得低于已登记回款合计。
      </p>

      <ContractForm
        contractId={contract.id}
        isEdit
        showOwnerSelect
        salesUsers={salesUsers}
        currentUserId={session.user.id}
        paymentMethodOptions={paymentMethods.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        internalCostNameOptions={internalCostNames.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        externalCostNameOptions={externalCostNames.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        defaultValues={{
          title: contract.title,
          totalAmount: Number(contract.totalAmount),
          signingType: contract.signingType,
          signCustomerId: contract.signCustomerId,
          signCustomerName: contract.signCustomer.name,
          endUserCustomerId: contract.endUserCustomerId,
          endUserCustomerName: contract.endUserCustomer.name,
          signContactId: contract.signContactId ?? undefined,
          ourRepresentativeId: contract.ourRepresentativeId ?? session.user.id,
          paymentMethod: contract.paymentMethod ?? undefined,
          ownerId: contract.ownerId,
          opportunityId: contract.opportunityId ?? undefined,
          opportunityTitle: contract.opportunity?.title,
          signedAt: contract.signedAt?.toISOString(),
          effectiveAt: contract.effectiveAt?.toISOString(),
          expiresAt: contract.expiresAt?.toISOString(),
          notes: contract.notes ?? undefined,
          products: contract.products.map((row) => ({
            productServiceId: row.productServiceId,
            productName: row.productName,
            description: row.description,
            costAmount: Number(row.costAmount || row.actualCostPrice),
            costType: row.costType,
            externalInstallments: row.externalInstallments.map((item) => ({
              periodNumber: item.periodNumber,
              amount: Number(item.amount),
              condition: item.condition,
              dueAt: item.dueAt?.toISOString(),
            })),
          })),
          installments: contract.installments.map((row) => ({
            periodNumber: row.periodNumber,
            amount: Number(row.amount),
            condition: row.condition,
            dueAt: row.dueAt?.toISOString(),
          })),
        }}
        submitLabel="保存修改"
      />
    </div>
  );
}
