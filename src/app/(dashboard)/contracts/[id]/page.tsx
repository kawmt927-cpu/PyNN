import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getContractForUser } from "@/lib/opportunities/access";
import {
  canManageContractApproval,
  canEditContract,
  canHandleRejectedContract,
  canRecordContractPayment,
  canManageContractAttachments,
  isSignedContractStatus,
} from "@/lib/contracts/access";
import { isPendingContractApproval } from "@/lib/contracts/approval";
import { ContractApprovalActions } from "@/components/contracts/contract-approval-actions";
import {
  allocatePaymentsWaterfall,
  sumPaymentRecords,
} from "@/lib/contracts/payment-waterfall";
import {
  CONTRACT_STATUS_LABELS,
  SIGNING_TYPE_LABELS,
} from "@/lib/permissions";
import { DEAL_PARTY_ROLE_LABELS } from "@/lib/deals/party-roles";
import { formatAmount } from "@/lib/opportunities/funnel";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallmentProgressChart } from "@/components/contracts/installment-progress-chart";
import { ContractPaymentPanel } from "@/components/contracts/contract-payment-panel";
import { ContractInvoicePanel } from "@/components/contracts/contract-invoice-panel";
import { ExternalCostPayoutPanel } from "@/components/contracts/external-cost-payout-panel";
import { ContractAttachmentsPanel } from "@/components/contracts/contract-attachments-panel";
import { ContractForm } from "@/components/contracts/contract-form";
import { DeleteRejectedContractButton } from "@/components/contracts/delete-rejected-contract-button";
import { resolveBackNavigation, selfReturnPath, withReturnTo } from "@/lib/navigation/return-to";
import { getConfigOptions, CONFIG_CATEGORY, labelForConfig } from "@/lib/config-options";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import {
  approveContract,
  rejectContract,
  deleteRejectedContract,
  addContractPaymentRecord,
  deleteContractPaymentRecord,
  addContractInvoiceRecord,
  deleteContractInvoiceRecord,
  addExternalCostPayoutRecord,
  deleteExternalCostPayoutRecord,
} from "@/app/(dashboard)/contracts/actions";
import {
  ENTITY_TYPES,
  listEntityOperationLogs,
} from "@/lib/audit/entity-operation-log";
import { EntityOperationLogList } from "@/components/audit/entity-operation-log-list";

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
      parties: {
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      products: {
        orderBy: { productName: "asc" },
        include: {
          productService: { select: { name: true } },
          externalInstallments: { orderBy: { periodNumber: "asc" } },
          externalPayoutRecords: {
            orderBy: { paidAt: "desc" },
            include: { recordedBy: { select: { name: true } } },
          },
        },
      },
      installments: { orderBy: { periodNumber: "asc" } },
      paymentRecords: {
        orderBy: { paidAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      },
      invoiceRecords: {
        orderBy: { invoicedAt: "desc" },
        include: {
          recordedBy: { select: { name: true } },
          attachments: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      },
    },
  });

  if (!contract) notFound();
  const accessible = await getContractForUser(id, session.user.role, session.user.id);
  if (!accessible) notFound();

  const operationLogs = await listEntityOperationLogs(ENTITY_TYPES.CONTRACT, id);

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

  const productSelfCost = contract.products
    .filter((row) => row.costType !== "EXTERNAL")
    .reduce((sum, row) => sum + Number(row.costAmount || row.actualCostPrice), 0);
  const externalCostTotal = contract.products
    .filter((row) => row.costType === "EXTERNAL")
    .reduce((sum, row) => sum + Number(row.costAmount || row.actualCostPrice), 0);

  const businessCosts = await prisma.salesCost.findMany({
    where: {
      costType: "BUSINESS",
      customerId: {
        in: [contract.signCustomerId, contract.endUserCustomerId],
      },
    },
    orderBy: { costDate: "desc" },
    include: {
      salesUser: { select: { name: true } },
      customer: { select: { id: true, name: true } },
    },
    take: 50,
  });
  const businessCostTotal = businessCosts.reduce(
    (sum, row) => sum + Number(row.totalAmount),
    0
  );
  const allCostTotal = productSelfCost + externalCostTotal + businessCostTotal;

  const signed = isSignedContractStatus(contract.status);
  const canEdit = canEditContract(session.user.role);
  const canHandleRejected = canHandleRejectedContract(session.user.role, session.user.id, {
    ownerId: contract.ownerId,
    submittedById: contract.submittedById,
    status: contract.status,
  });
  const showResubmit = canHandleRejected && query.edit === "1";
  const canApprove =
    canManageContractApproval(session.user.role) && isPendingContractApproval(contract.status);
  const canUploadAttachments = canManageContractAttachments(session.user.role);

  const [salesUsers, paymentMethods, internalCostNames, externalCostNames] = await Promise.all([
    listSalesUsersForSelect({
      viewer: { id: session.user.id, role: session.user.role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
      includeUserIds: [contract.ownerId, contract.ourRepresentativeId].filter(
        (id): id is string => Boolean(id)
      ),
    }),
    getConfigOptions(CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD),
    getConfigOptions(CONFIG_CATEGORY.INTERNAL_COST_PRODUCT),
    getConfigOptions(CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT),
  ]);

  const paymentMethodLabels = Object.fromEntries(
    paymentMethods.map((o) => [o.value, o.label])
  );

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
          internalCostNameOptions={internalCostNames.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          externalCostNameOptions={externalCostNames.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          initialParties={contract.parties.map((p) => ({
            key: p.id,
            customerId: p.customerId,
            customerName: p.customer.name,
            role: p.role,
            note: p.note ?? "",
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
          {canEdit && contract.status !== "REJECTED" && (
            <Button asChild variant="outline" size="sm">
              <Link href={withReturnTo(`/contracts/${id}/edit`, selfPath)}>编辑合同</Link>
            </Button>
          )}
          {canHandleRejected && (
            <>
              <Button asChild size="sm">
                <Link href={`${selfPath}${selfPath.includes("?") ? "&" : "?"}edit=1`}>
                  编辑后重新申请
                </Link>
              </Button>
              <DeleteRejectedContractButton contractId={contract.id} />
            </>
          )}
          <BackLink href={backHref} label={backLabel} />
        </div>
      </div>

      {contract.status === "REJECTED" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">合同已驳回</p>
          {contract.rejectReason ? (
            <p className="mt-1">{contract.rejectReason}</p>
          ) : null}
          {canHandleRejected ? (
            <p className="mt-2 text-muted-foreground">
              可删除该合同，或修改后重新申请。已驳回合同不会出现在合同列表中。
            </p>
          ) : null}
        </div>
      )}

      {canApprove && (
        <ContractApprovalActions
          contractId={contract.id}
          variant="panel"
          onApprove={approveContract}
          onReject={rejectContract}
        />
      )}

      {!canApprove && isPendingContractApproval(contract.status) && (
        <div className="rounded-md border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          合同已提交，等待销售管理审核通过后即可登记回款。
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
          <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
            <p>
              <span className="text-muted-foreground">产品本身成本：</span>
              {formatAmount(productSelfCost)}
            </p>
            <p>
              <span className="text-muted-foreground">外部成本合同：</span>
              {formatAmount(externalCostTotal)}
            </p>
            <p>
              <span className="text-muted-foreground">商务成本：</span>
              {formatAmount(businessCostTotal)}
            </p>
            <p className="pt-1 font-medium">
              成本合计：{formatAmount(allCostTotal)}
              <span className="ml-3 font-normal text-muted-foreground">
                预估毛利：{formatAmount(totalAmount - allCostTotal)}
              </span>
            </p>
          </div>
          <p>
            <span className="text-muted-foreground">签约类型：</span>
            {SIGNING_TYPE_LABELS[contract.signingType]}
          </p>
          {contract.paymentMethod && (
            <p>
              <span className="text-muted-foreground">支付方式：</span>
              {labelForConfig(paymentMethodLabels, contract.paymentMethod)}
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
              <span className="text-muted-foreground">对方代表：</span>
              {contract.signContact.name}
              {contract.signContact.title ? `（${contract.signContact.title}）` : ""}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">最终用户：</span>
            <Link
              href={withReturnTo(`/customers/${contract.endUserCustomer.id}`, selfPath)}
              className="text-primary hover:underline"
            >
              {contract.endUserCustomer.name}
            </Link>
          </p>
          {contract.parties.length > 0 ? (
            <div>
              <p className="text-muted-foreground">关联客户</p>
              <ul className="mt-1 space-y-1">
                {contract.parties.map((p) => (
                  <li key={p.id}>
                    <span className="text-xs text-muted-foreground">
                      {DEAL_PARTY_ROLE_LABELS[p.role]} ·{" "}
                    </span>
                    <Link
                      href={withReturnTo(`/customers/${p.customer.id}`, selfPath)}
                      className="text-primary hover:underline"
                    >
                      {p.customer.name}
                    </Link>
                    {p.note ? (
                      <span className="text-muted-foreground">（{p.note}）</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">合同附件</CardTitle>
        </CardHeader>
        <CardContent>
          <ContractAttachmentsPanel
            contractId={contract.id}
            canUpload={canUploadAttachments}
            canDelete={false}
          />
        </CardContent>
      </Card>

      {(contract.products.length > 0 || businessCosts.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">成本构成</CardTitle>
            {contract.products.some((row) => row.costType === "EXTERNAL") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/contracts/external-costs?contractId=${contract.id}`}>
                  外部成本维护
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            {contract.products.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">产品 / 外部成本合同</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">名称</th>
                      <th className="pb-2 pr-4">类型</th>
                      <th className="pb-2 pr-4">成本 / 应付</th>
                      <th className="pb-2">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contract.products.map((row) => {
                      const paid = sumPaymentRecords(row.externalPayoutRecords);
                      return (
                        <tr key={row.id} className="border-b">
                          <td className="py-2 pr-4">{row.productName}</td>
                          <td className="py-2 pr-4">
                            {row.costType === "EXTERNAL" ? "外部成本合同" : "产品本身"}
                          </td>
                          <td className="py-2 pr-4">
                            {formatAmount(row.costAmount || row.actualCostPrice)}
                            {row.costType === "EXTERNAL" ? (
                              <span className="ml-2 text-muted-foreground">
                                （已付 {formatAmount(paid)}）
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-muted-foreground">{row.description || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {businessCosts.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">商务成本</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">日期</th>
                      <th className="pb-2 pr-4">客户</th>
                      <th className="pb-2 pr-4">销售</th>
                      <th className="pb-2 pr-4">金额</th>
                      <th className="pb-2">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessCosts.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {row.costDate.toISOString().slice(0, 10)}
                        </td>
                        <td className="py-2 pr-4">{row.customer?.name ?? "—"}</td>
                        <td className="py-2 pr-4">{row.salesUser.name}</td>
                        <td className="py-2 pr-4">{formatAmount(row.totalAmount)}</td>
                        <td className="py-2 text-muted-foreground">{row.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  商务成本来自「销售成本」中关联本签约客户或最终用户的商务费用，便于追踪合同全成本。
                </p>
              </div>
            ) : null}
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
        <ContractPaymentPanel
          contractId={contract.id}
          totalAmount={totalAmount}
          totalPaid={totalPaid}
          canDelete={canManageContractApproval(session.user.role)}
          onAdd={addContractPaymentRecord}
          onDelete={deleteContractPaymentRecord}
          records={contract.paymentRecords.map((row) => ({
            id: row.id,
            amount: Number(row.amount),
            paidAt: row.paidAt.toISOString(),
            notes: row.notes,
            recordedBy: row.recordedBy,
          }))}
        />
      )}

      {signed && canRecordContractPayment(session.user.role) && (
        <ContractInvoicePanel
          contractId={contract.id}
          totalAmount={totalAmount}
          canDelete={canManageContractApproval(session.user.role)}
          onAdd={addContractInvoiceRecord}
          onDelete={deleteContractInvoiceRecord}
          records={contract.invoiceRecords.map((row) => ({
            id: row.id,
            amount: Number(row.amount),
            taxRatePercent: Number(row.taxRatePercent),
            invoicedAt: row.invoicedAt.toISOString(),
            invoiceNo: row.invoiceNo,
            notes: row.notes,
            recordedBy: row.recordedBy,
            attachments: row.attachments.map((a) => ({
              id: a.id,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
            })),
          }))}
        />
      )}

      {signed &&
        canRecordContractPayment(session.user.role) &&
        contract.products
          .filter((row) => row.costType === "EXTERNAL")
          .map((row) => {
            const paid = sumPaymentRecords(row.externalPayoutRecords);
            return (
              <ExternalCostPayoutPanel
                key={row.id}
                productId={row.id}
                productName={row.productName}
                costAmount={Number(row.costAmount || row.actualCostPrice)}
                totalPaid={paid}
                canDelete={canManageContractApproval(session.user.role)}
                onAdd={addExternalCostPayoutRecord}
                onDelete={deleteExternalCostPayoutRecord}
                installments={row.externalInstallments.map((item) => ({
                  periodNumber: item.periodNumber,
                  amount: Number(item.amount),
                  condition: item.condition,
                  dueAt: item.dueAt?.toISOString() ?? null,
                }))}
                records={row.externalPayoutRecords.map((item) => ({
                  id: item.id,
                  amount: Number(item.amount),
                  paidAt: item.paidAt.toISOString(),
                  notes: item.notes,
                  recordedBy: item.recordedBy,
                }))}
              />
            );
          })}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">操作日志</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityOperationLogList logs={operationLogs} />
        </CardContent>
      </Card>
    </div>
  );
}
