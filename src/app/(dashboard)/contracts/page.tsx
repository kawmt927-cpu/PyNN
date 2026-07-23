import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { contractListWhere } from "@/lib/opportunities/access";
import { getContractPaymentDueBadgeMap } from "@/lib/contracts/payment-due";
import { sumPaymentRecords } from "@/lib/contracts/payment-waterfall";
import { SIGNED_CONTRACT_STATUSES, canEditContract } from "@/lib/contracts/access";
import {
  buildContractListFilterWhere,
  buildContractListHref,
  hasActiveContractListFilters,
  parseContractListFilters,
} from "@/lib/contracts/list-filters";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ContractPaymentDueStatusBadge } from "@/components/contracts/contract-payment-due-badge";
import { ContractListFilters } from "@/components/contracts/contract-list-filters";

function formatPaymentRatio(paid: number, total: number) {
  if (total <= 0) return "—";
  return `${((paid / total) * 100).toFixed(1)}%`;
}

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    ownerId?: string;
  }>;
};

export default async function ContractsPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"]);
  const filters = parseContractListFilters(query);
  const accessWhere = contractListWhere(session.user.role, session.user.id);
  const filterWhere = buildContractListFilterWhere(filters);
  const where: Prisma.ContractWhereInput = {
    AND: [accessWhere, filterWhere],
  };
  const showOwnerFilter =
    session.user.role === "SALES_MANAGER" || session.user.role === "ADMIN";
  const canManageContracts = canEditContract(session.user.role);

  const [contracts, salesUsers] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        signCustomer: { select: { name: true } },
        endUserCustomer: { select: { name: true } },
        owner: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
        project: { select: { id: true } },
        paymentRecords: { select: { amount: true } },
        products: { select: { costAmount: true, actualCostPrice: true, costType: true } },
      },
      take: 200,
    }),
    showOwnerFilter
      ? listSalesUsersForSelect({
          viewer: { id: session.user.id, role: session.user.role },
          roles: ["SALES", "SALES_MANAGER", "ADMIN"],
        })
      : Promise.resolve([]),
  ]);

  const dueBadgeMap = await getContractPaymentDueBadgeMap(contracts.map((c) => c.id));
  const listPath = buildContractListHref(filters);
  const filtersActive = hasActiveContractListFilters(filters);

  const signedContracts = contracts.filter((c) =>
    SIGNED_CONTRACT_STATUSES.includes(c.status)
  );
  const signedAmount = signedContracts.reduce((sum, c) => sum + Number(c.totalAmount), 0);
  const signedPaid = signedContracts.reduce(
    (sum, c) => sum + sumPaymentRecords(c.paymentRecords),
    0
  );
  const signedUnpaid = Math.max(0, signedAmount - signedPaid);
  const signedCostSelf = signedContracts.reduce(
    (sum, c) =>
      sum +
      c.products
        .filter((row) => row.costType !== "EXTERNAL")
        .reduce(
          (productSum, row) => productSum + Number(row.costAmount || row.actualCostPrice || 0),
          0
        ),
    0
  );
  const signedCostExternal = signedContracts.reduce(
    (sum, c) =>
      sum +
      c.products
        .filter((row) => row.costType === "EXTERNAL")
        .reduce(
          (productSum, row) => productSum + Number(row.costAmount || row.actualCostPrice || 0),
          0
        ),
    0
  );
  // 与合同详情一致：关联签约客户 / 最终用户的商务费用；列表汇总按客户去重，避免多合同重复累加
  const linkedCustomerIds = [
    ...new Set(
      signedContracts.flatMap((c) =>
        [c.signCustomerId, c.endUserCustomerId].filter((id): id is string => Boolean(id))
      )
    ),
  ];
  const businessCostAgg =
    linkedCustomerIds.length > 0
      ? await prisma.salesCost.aggregate({
          where: {
            costType: "BUSINESS",
            customerId: { in: linkedCustomerIds },
          },
          _sum: { totalAmount: true },
        })
      : { _sum: { totalAmount: null } };
  const signedCostBusiness = Number(businessCostAgg._sum.totalAmount ?? 0);
  const signedCost = signedCostSelf + signedCostExternal + signedCostBusiness;
  const signedMargin = signedAmount - signedCost;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">合同管理</h1>
        {canManageContracts && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/contracts/external-costs">外部成本</Link>
            </Button>
            <Button asChild>
              <Link href="/contracts/new">新建合同</Link>
            </Button>
          </div>
        )}
        {!canManageContracts && session.user.role !== "PROJECT_MANAGER" && (
          <Button asChild variant="outline">
            <Link href="/contracts/external-costs">外部成本</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">已签约销售总额</p>
            <p className="mt-1 text-xl font-semibold">{formatAmount(signedAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">待回款总额</p>
            <p className="mt-1 text-xl font-semibold">{formatAmount(signedUnpaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">成本总计</p>
            <p className="mt-1 text-xl font-semibold">{formatAmount(signedCost)}</p>
            <div className="mt-1 space-y-0.5 text-[11px] leading-5 text-muted-foreground">
              <div className="flex justify-between gap-3">
                <span>产品本身</span>
                <span className="tabular-nums">{formatAmount(signedCostSelf)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>外部成本合同</span>
                <span className="tabular-nums">{formatAmount(signedCostExternal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>商务成本</span>
                <span className="tabular-nums">{formatAmount(signedCostBusiness)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">预估毛利总计</p>
            <p className="mt-1 text-xl font-semibold">{formatAmount(signedMargin)}</p>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        汇总基于当前列表筛选结果中的已签署合同
        {session.user.role === "SALES" ? "（仅本人负责）" : "（可见范围内）"}。
      </p>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              合同列表
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({contracts.length}
                {filtersActive ? " 条匹配" : ""})
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              已签署合同若分期未结清且计划到期，将显示「回款逾期 / 待收」标记。点击卡片查看详情。
            </p>
          </div>
        </div>

        <Suspense fallback={<p className="text-sm text-muted-foreground">加载筛选…</p>}>
          <ContractListFilters showOwnerFilter={showOwnerFilter} salesUsers={salesUsers} />
        </Suspense>

        {contracts.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-muted-foreground">
                {filtersActive ? "没有符合条件的合同，请调整筛选。" : "暂无合同。"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {contracts.map((c) => {
              const totalAmount = Number(c.totalAmount);
              const totalPaid = sumPaymentRecords(c.paymentRecords);
              const ratio = formatPaymentRatio(totalPaid, totalAmount);
              const due = dueBadgeMap.get(c.id);
              const href = withReturnTo(`/contracts/${c.id}`, listPath);

              return (
                <li key={c.id}>
                  <Link href={href} className="block">
                    <Card className="transition-colors hover:border-primary/40 hover:bg-muted/30">
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
                            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {CONTRACT_STATUS_LABELS[c.status]}
                            </span>
                            <ContractPaymentDueStatusBadge summary={due} />
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>
                              签约客户：
                              <span className="text-foreground">{c.signCustomer.name}</span>
                            </span>
                            <span>
                              最终用户：
                              <span className="text-foreground">{c.endUserCustomer.name}</span>
                            </span>
                            <span>
                              负责销售：
                              <span className="text-foreground">{c.owner.name}</span>
                            </span>
                            {c.opportunity ? (
                              <span>
                                关联商机：
                                <span className="text-foreground">{c.opportunity.title}</span>
                              </span>
                            ) : null}
                            {c.contractNo ? <span>编号：{c.contractNo}</span> : null}
                          </div>
                        </div>
                        <div className="shrink-0 space-y-1 text-sm sm:text-right">
                          <p>
                            <span className="text-muted-foreground">合同金额 </span>
                            <span className="font-medium">{formatAmount(totalAmount)}</span>
                          </p>
                          <p>
                            <span className="text-muted-foreground">回款 </span>
                            <span className="font-medium">
                              {formatAmount(totalPaid)}
                              <span className="mx-1 font-normal text-muted-foreground">/</span>
                              {formatAmount(totalAmount)}
                            </span>
                            <span className="ml-1.5 font-medium">（{ratio}）</span>
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
