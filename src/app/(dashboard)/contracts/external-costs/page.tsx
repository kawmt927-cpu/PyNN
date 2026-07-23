import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { contractListWhere } from "@/lib/opportunities/access";
import {
  canEditContract,
  canManageContractApproval,
  canRecordContractPayment,
  isSignedContractStatus,
} from "@/lib/contracts/access";
import { allocatePaymentsWaterfall, sumPaymentRecords } from "@/lib/contracts/payment-waterfall";
import { formatAmount } from "@/lib/opportunities/funnel";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalCostPayoutPanel } from "@/components/contracts/external-cost-payout-panel";
import { ExternalCostPlanEditDialog } from "@/components/contracts/external-cost-plan-edit-dialog";
import {
  addExternalCostPayoutRecord,
  deleteExternalCostPayoutRecord,
} from "@/app/(dashboard)/contracts/actions";

type Props = {
  searchParams: Promise<{
    contractId?: string;
    unpaid?: string;
    paid?: string;
  }>;
};

export default async function ExternalCostsPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"]);
  const contractWhere = contractListWhere(session.user.role, session.user.id);

  const products = await prisma.contractProduct.findMany({
    where: {
      costType: "EXTERNAL",
      contract: {
        AND: [contractWhere, query.contractId ? { id: query.contractId } : {}],
      },
    },
    orderBy: [{ contract: { updatedAt: "desc" } }, { productName: "asc" }],
    include: {
      contract: {
        select: {
          id: true,
          title: true,
          status: true,
          ownerId: true,
          owner: { select: { id: true, name: true } },
        },
      },
      externalInstallments: { orderBy: { periodNumber: "asc" } },
      externalPayoutRecords: {
        orderBy: { paidAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      },
    },
    take: 200,
  });

  const now = Date.now();
  const enriched = products.map((row) => {
    const costAmount = Number(row.costAmount || row.actualCostPrice);
    const paid = sumPaymentRecords(row.externalPayoutRecords);
    const remaining = Math.max(0, costAmount - paid);
    const waterfall = allocatePaymentsWaterfall(
      paid,
      row.externalInstallments.map((item) => ({
        id: item.id,
        periodNumber: item.periodNumber,
        amount: Number(item.amount),
        condition: item.condition,
        dueAt: item.dueAt,
      }))
    );
    const periodCount = waterfall.length;
    const currentPeriod = waterfall.find((item) => item.statusLabel !== "已完成") ?? null;
    const currentDueAt = currentPeriod?.dueAt ? new Date(currentPeriod.dueAt) : null;
    const overdue =
      remaining > 0.01 &&
      currentDueAt != null &&
      currentDueAt.getTime() < now;
    return {
      row,
      costAmount,
      paid,
      remaining,
      periodCount,
      currentPeriod,
      currentDueAt,
      overdue,
    };
  });

  const showUnpaidOnly = query.unpaid === "1";
  const showPaidOnly = query.paid === "1";
  const filtered = enriched.filter((item) => {
    if (showUnpaidOnly && item.remaining <= 0.01) return false;
    if (showPaidOnly && item.remaining > 0.01) return false;
    return true;
  });

  const canRecord = canRecordContractPayment(session.user.role);
  const canDelete = canManageContractApproval(session.user.role);
  const canEditPlan = canEditContract(session.user.role) || session.user.role === "SALES";

  function hrefWith(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const next = {
      contractId: query.contractId,
      unpaid: query.unpaid,
      paid: query.paid,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/contracts/external-costs?${qs}` : "/contracts/external-costs";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">外部成本付款</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护外部产品付款计划，并登记每次实付。
          </p>
        </div>
        <BackLink href="/contracts" label="返回合同" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">筛选</span>
        <Button asChild variant={showUnpaidOnly ? "default" : "outline"} size="sm">
          <Link
            href={hrefWith({
              unpaid: showUnpaidOnly ? undefined : "1",
              paid: undefined,
            })}
          >
            未付清
          </Link>
        </Button>
        <Button asChild variant={showPaidOnly ? "default" : "outline"} size="sm">
          <Link
            href={hrefWith({
              paid: showPaidOnly ? undefined : "1",
              unpaid: undefined,
            })}
          >
            付清
          </Link>
        </Button>
        {query.contractId ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefWith({ contractId: undefined })}>清除合同筛选</Link>
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            暂无外部成本产品。
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(({ row, costAmount, paid, remaining, periodCount, currentPeriod, currentDueAt, overdue }) => {
            const signed = isSignedContractStatus(row.contract.status);
            const ownerCanEdit =
              canEditPlan &&
              (canEditContract(session.user.role) || row.contract.ownerId === session.user.id);
            const periodSummary =
              periodCount === 0
                ? "未设分期"
                : remaining <= 0.01
                  ? `共 ${periodCount} 期 · 已全部付清`
                  : currentPeriod
                    ? `共 ${periodCount} 期 · 当前应付第 ${currentPeriod.periodNumber} 期（${formatAmount(currentPeriod.amount - currentPeriod.allocatedAmount)}）`
                    : `共 ${periodCount} 期`;
            return (
              <Card key={row.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium leading-snug">
                      <Link
                        href={`/contracts/${row.contract.id}`}
                        className="hover:underline"
                      >
                        {row.contract.title}
                      </Link>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      {row.productName}
                      {overdue ? (
                        <span className="ml-2 text-xs font-medium text-destructive">逾期</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {row.contract.owner.name} · {periodSummary} · 已付{" "}
                      <span className="font-medium text-foreground">{formatAmount(paid)}</span>
                      {" / "}
                      {formatAmount(costAmount)}
                      {remaining > 0.01 ? ` · 待付 ${formatAmount(remaining)}` : ""}
                      {currentDueAt && remaining > 0.01
                        ? ` · 到期 ${currentDueAt.toLocaleDateString("zh-CN")}`
                        : ""}
                    </p>
                    {!signed ? (
                      <p className="text-xs text-muted-foreground">合同签署后可登记实付</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {ownerCanEdit ? (
                      <ExternalCostPlanEditDialog
                        productId={row.id}
                        productName={row.productName}
                        costAmount={costAmount}
                        installments={row.externalInstallments.map((item) => ({
                          periodNumber: item.periodNumber,
                          amount: Number(item.amount),
                          condition: item.condition,
                          dueAt: item.dueAt?.toISOString() ?? null,
                        }))}
                      />
                    ) : null}
                    {signed && canRecord ? (
                      <ExternalCostPayoutPanel
                        compact
                        productId={row.id}
                        productName={row.productName}
                        costAmount={costAmount}
                        totalPaid={paid}
                        canDelete={canDelete}
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
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
