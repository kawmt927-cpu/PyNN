import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getContractForUser } from "@/lib/opportunities/access";
import {
  canManageContractApproval,
  canEditContract,
  canRecordContractPayment,
  isSignedContractStatus,
} from "@/lib/contracts/access";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
} from "@/lib/contracts/payment-waterfall";
import {
  CONTRACT_STATUS_LABELS,
  SIGNING_TYPE_LABELS,
} from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallmentProgressChart } from "@/components/contracts/installment-progress-chart";
import { ContractPaymentPanel } from "@/components/contracts/contract-payment-panel";
import { ContractForm } from "@/components/contracts/contract-form";
import { resolveBackNavigation, selfReturnPath, withReturnTo } from "@/lib/navigation/return-to";
import { getConfigOptions, CONFIG_CATEGORY } from "@/lib/config-options";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; edit?: string }>;
};

export default async function ContractDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"]);

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      signCustomer: { select: { id: true, name: true } },
      endUserCustomer: { select: { id: true, name: true } },
      signContact: { select: { id: true, name: true, title: true } },
      ourRepresentative: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      opportunity: { select: { id: true, title: true, expectedAmount: true } },
      project: { select: { id: true, name: true } },
      products: {
        orderBy: { productName: "asc" },
        include: { productService: { select: { name: true } } },
      },
      installments: { orderBy: { periodNumber: "asc" } },
      paymentRecords: {
        orderBy: { paidAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      },
    },
  });

  if (!contract) notFound();
  const accessible = await getContractForUser(id, session.user.role, session.user.id);
  if (!accessible) notFound();

  const { backHref, backLabel } = resolveBackNavigation(query, "/contracts");
  const selfPath = selfReturnPath(`/contracts/${id}`, query);

  const totalPaid = sumPaymentRecords(contract.paymentRecords);
  const totalAmount = Number(contract.totalAmount);
  const waterfallRows = allocatePaymentsWaterfall(
    totalPaid,
    contract.installments.map((row) => ({
      id: row.id,
      periodNumber: row.periodNumber,
      amount: Number(row.amount),
      condition: row.condition,
      dueAt: row.dueAt,
    }))
  );

  const productCostTotal = contract.products.reduce(
    (sum, row) => sum + Number(row.costAmount || row.actualCostPrice),
    0
  );
  const signed = isSignedContractStatus(contract.status);
  const showResubmit = contract.status === "REJECTED" && query.edit === "1";
  const canApprove =
    canManageContractApproval(session.user.role) && contract.status === "PENDING_APPROVAL";
  const canEdit = canEditContract(session.user.role);

  const [salesUsers, paymentMethods] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["SALES", "SALES_MANAGER", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getConfigOptions(CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD),
  ]);

  if (showResubmit) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">修改并重新提交合同</h1>
          <BackLink href={selfPath} label="返回详情" />
        </div>
        {contract.rejectReason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            驳回原因：{contract.rejectReason}
          </div>
        )}
        <ContractForm
          contractId={contract.id}
          isResubmit
          showOwnerSelect={session.user.role !== "SALES"}
          salesUsers={salesUsers}
          currentUserId={session.user.id}
          paymentMethodOptions={paymentMethods.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          defaultValues={{
            title: contract.title,
            totalAmount: totalAmount,
            signingType: contract.signingType,
            signCustomerId: contract.signCustomerId,
            signCustomerName: contract.signCustomer.name,
            endUserCustomerId: contract.endUserCustomerId,
            endUserCustomerName: contract.endUserCustomer.name,
            signContactId: contract.signContactId ?? undefined,
            ourRepresentativeId: contract.ourRepresentativeId ?? session.user.id,
            paymentMethod: contract.paymentMethod ?? undefined,
            ownerId: contract.ownerId,
            signedAt: contract.signedAt?.toISOString(),
            notes: contract.notes ?? undefined,
            products: contract.products.map((row) => ({
              productServiceId: row.productServiceId,
              productName: row.productName,
              costAmount: Number(row.costAmount || row.actualCostPrice),
            })),
            installments: contract.installments.map((row) => ({
              periodNumber: row.periodNumber,
              amount: Number(row.amount),
              condition: row.condition,
              dueAt: row.dueAt?.toISOString(),
            })),
          }}
          submitLabel="重新提交审核"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{contract.title}</h1>
          {contract.contractNo && (
            <p className="text-sm text-muted-foreground">编号：{contract.contractNo}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link href={withReturnTo(`/contracts/${id}/edit`, selfPath)}>编辑合同</Link>
            </Button>
          )}
          <BackLink href={backHref} label={backLabel} />
        </div>
      </div>

      {contract.status === "REJECTED" && contract.rejectReason && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">合同已驳回</p>
          <p className="mt-1">{contract.rejectReason}</p>
          {session.user.role === "SALES" && contract.ownerId === session.user.id && (
            <Link href={`${selfPath}${selfPath.includes("?") ? "&" : "?"}edit=1`} className="mt-2 inline-block text-primary hover:underline">
              修改并重新提交
            </Link>
          )}
        </div>
      )}

      {canApprove && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          该合同待审核，请前往
          <Link href="/approvals?type=contract" className="mx-1 font-medium text-primary hover:underline">
            审批中心
          </Link>
          处理。
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">合同信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">合同金额：</span>
            {formatAmount(contract.totalAmount)}
          </p>
          <p>
            <span className="text-muted-foreground">产品成本合计：</span>
            {formatAmount(productCostTotal)}
            <span className="ml-3 text-muted-foreground">
              预估毛利：{formatAmount(totalAmount - productCostTotal)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">签约类型：</span>
            {SIGNING_TYPE_LABELS[contract.signingType]}
          </p>
          {contract.paymentMethod && (
            <p>
              <span className="text-muted-foreground">支付方式：</span>
              {contract.paymentMethod}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">状态：</span>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </p>
          <p>
            <span className="text-muted-foreground">签约客户：</span>
            <Link
              href={withReturnTo(`/customers/${contract.signCustomer.id}`, selfPath)}
              className="text-primary hover:underline"
            >
              {contract.signCustomer.name}
            </Link>
          </p>
          {contract.signContact && (
            <p>
              <span className="text-muted-foreground">甲方代表：</span>
              {contract.signContact.name}
              {contract.signContact.title ? `（${contract.signContact.title}）` : ""}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">终用户：</span>
            <Link
              href={withReturnTo(`/customers/${contract.endUserCustomer.id}`, selfPath)}
              className="text-primary hover:underline"
            >
              {contract.endUserCustomer.name}
            </Link>
          </p>
          {contract.ourRepresentative && (
            <p>
              <span className="text-muted-foreground">我方代表：</span>
              {contract.ourRepresentative.name}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">负责销售：</span>
            {contract.owner.name}
          </p>
          {contract.opportunity && (
            <p>
              <span className="text-muted-foreground">关联商机：</span>
              <Link
                href={withReturnTo(`/opportunities/${contract.opportunity.id}`, selfPath)}
                className="text-primary hover:underline"
              >
                {contract.opportunity.title}
              </Link>
            </p>
          )}
          {contract.signedAt && (
            <p>
              <span className="text-muted-foreground">签约日期：</span>
              {contract.signedAt.toISOString().slice(0, 10)}
            </p>
          )}
          {contract.approvedBy && (
            <p>
              <span className="text-muted-foreground">审核人：</span>
              {contract.approvedBy.name}
            </p>
          )}
          {contract.project && (
            <p>
              <span className="text-muted-foreground">关联项目：</span>
              <Link href="/projects" className="text-primary hover:underline">
                {contract.project.name}
              </Link>
            </p>
          )}
          {contract.notes && (
            <div>
              <p className="text-muted-foreground">备注</p>
              <p className="mt-1 whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {contract.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">签约产品</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">产品</th>
                  <th className="pb-2">成本</th>
                </tr>
              </thead>
              <tbody>
                {contract.products.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-2 pr-4">{row.productName}</td>
                    <td className="py-2">{formatAmount(row.costAmount || row.actualCostPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {contract.installments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">回款进度</CardTitle>
          </CardHeader>
          <CardContent>
            {signed ? (
              <InstallmentProgressChart
                rows={waterfallRows}
                totalPaid={totalPaid}
                totalAmount={totalAmount}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                合同签署后将展示回款进度。当前仅有回款计划：
              </p>
            )}
            {!signed && (
              <ul className="mt-3 space-y-1 text-sm">
                {contract.installments.map((row) => (
                  <li key={row.id}>
                    第 {row.periodNumber} 期 · {formatAmount(row.amount)}
                    {row.condition ? ` · ${row.condition}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {signed && canRecordContractPayment(session.user.role) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">回款记录</CardTitle>
          </CardHeader>
          <CardContent>
            <ContractPaymentPanel
              contractId={contract.id}
              canDelete={canManageContractApproval(session.user.role)}
              records={contract.paymentRecords.map((row) => ({
                id: row.id,
                amount: Number(row.amount),
                paidAt: row.paidAt.toISOString(),
                notes: row.notes,
                recordedBy: row.recordedBy,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
