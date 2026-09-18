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
  analyzeContractCollectible,
  listWindowCollectibleInstallments,
  matchesCollectFilter,
  matchesDueWithinFilter,
  matchesSettlementFilter,
  type CollectiblePeriod,
} from "@/lib/contracts/contract-collectible";
import {
  buildContractListFilterWhere,
  buildContractListHref,
  DUE_WITHIN_FILTER_OPTIONS,
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
import { CustomerNameLink } from "@/components/customers/customer-name-link";
import { ContractProjectLinkBadge } from "@/components/contracts/contract-project-link-badge";

function formatPaymentRatio(paid: number, total: number) {
  if (total <= 0) return "—";
  return `${((paid / total) * 100).toFixed(1)}%`;
}

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    ownerId?: string;
    settlement?: string;
    collect?: string;
    dueWithin?: string;
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
  const now = new Date();

  const [rawContracts, salesUsers] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        signCustomer: { select: { id: true, name: true } },
        endUserCustomer: { select: { id: true, name: true } },
        owner: { select: { name: true } },
        opportunity: { select: { id: true, title: true } },
        project: { select: { id: true } },
        paymentRecords: { select: { amount: true } },
        installments: {
          orderBy: { periodNumber: "asc" },
          select: {
            id: true,
            periodNumber: true,
            amount: true,
            condition: true,
            dueAt: true,
            collectionStatus: true,
          },
        },
        products: {
          select: { costAmount: true, actualCostPrice: true, costType: true, voidedAt: true },
        },
      },
      take: 500,
    }),
    showOwnerFilter
      ? listSalesUsersForSelect({
          viewer: { id: session.user.id, role: session.user.role },
          roles: ["SALES", "SALES_MANAGER", "ADMIN"],
        })
      : Promise.resolve([]),
  ]);

  type ListRow = (typeof rawContracts)[number] & {
    analysis: ReturnType<typeof analyzeContractCollectible>;
    windowPeriods: CollectiblePeriod[];
  };

  const contracts: ListRow[] = [];
  for (const contract of rawContracts) {
    const analysis = analyzeContractCollectible(contract, now);
    if (!matchesSettlementFilter(analysis, filters.settlement)) continue;
    if (!matchesCollectFilter(analysis, filters.collect)) continue;
    if (!matchesDueWithinFilter(analysis, filters.dueWithin, now)) continue;
    const windowPeriods = filters.dueWithin
      ? listWindowCollectibleInstallments(analysis, filters.dueWithin, now)
      : [];
    contracts.push({ ...contract, analysis, windowPeriods });
  }

  const dueBadgeMap = await getContractPaymentDueBadgeMap(contracts.map((c) => c.id));
  const listPath = buildContractListHref(filters);
  const filtersActive = hasActiveContractListFilters(filters);

  const signedContracts = contracts.filter((c) =>
    SIGNED_CONTRACT_STATUSES.includes(c.status)
  );
  const signedAmount = signedContracts.reduce((sum, c) => sum + Number(c.totalAmount), 0);
  // 可催口径待回款（扣坏账）
  const signedUnpaid = signedContracts.reduce(
    (sum, c) => sum + c.analysis.collectibleRemaining,
    0
  );

  const windowSummary = filters.dueWithin
    ? (() => {
        let amount = 0;
        let periods = 0;
        for (const row of contracts) {
          for (const period of row.windowPeriods) {
            amount += period.remainingAmount;
            periods += 1;
          }
        }
        return {
          amount: Math.round(amount * 100) / 100,
          periods,
          contracts: contracts.filter((c) => c.windowPeriods.length > 0).length,
          label:
            DUE_WITHIN_FILTER_OPTIONS.find((o) => o.value === filters.dueWithin)?.label ??
            "计划窗口",
        };
      })()
    : null;

  const signedCostSelf = signedContracts.reduce(
    (sum, c) =>
      sum +
      c.products
        .filter((row) => !row.voidedAt && row.costType !== "EXTERNAL")
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
        .filter((row) => !row.voidedAt && row.costType === "EXTERNAL")
        .reduce(
          (productSum, row) => productSum + Number(row.costAmount || row.actualCostPrice || 0),
          0
        ),
    0
  );
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
            <p className="text-xs text-muted-foreground">待催余额合计</p>
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
        汇总基于当前列表筛选结果中的已签署合同；待催余额不含坏账
        {session.user.role === "SALES" ? "（仅本人负责）" : "（可见范围内）"}。
        默认仅显示未完成合同。
      </p>

      {windowSummary ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium">
              计划窗口 · {windowSummary.label}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              可催 {formatAmount(windowSummary.amount)} · {windowSummary.periods} 期 ·{" "}
              {windowSummary.contracts} 份合同
            </p>
          </CardContent>
        </Card>
      ) : null}

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
              const projectProgressHref = withReturnTo(
                `/contracts/${c.id}#contract-project`,
                listPath
              );

              return (
                <li key={c.id}>
                  <Card className="transition-colors hover:border-primary/40 hover:bg-muted/30">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base leading-snug">
                            <Link href={href} className="hover:underline">
                              {c.title}
                            </Link>
                          </CardTitle>
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {CONTRACT_STATUS_LABELS[c.status]}
                          </span>
                          <ContractProjectLinkBadge
                            status={c.status}
                            hasProject={Boolean(c.project)}
                            href={projectProgressHref}
                            role={session.user.role}
                          />
                          <ContractPaymentDueStatusBadge summary={due} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            签约客户：
                            <CustomerNameLink
                              customerId={c.signCustomer.id}
                              name={c.signCustomer.name}
                              returnTo={listPath}
                              className="font-normal text-foreground"
                            />
                          </span>
                          <span>
                            最终用户：
                            <CustomerNameLink
                              customerId={c.endUserCustomer.id}
                              name={c.endUserCustomer.name}
                              returnTo={listPath}
                              className="font-normal text-foreground"
                            />
                          </span>
                          <span>
                            负责销售：
                            <span className="text-foreground">{c.owner.name}</span>
                          </span>
                          {c.opportunity ? (
                            <span>
                              关联商机：
                              <Link
                                href={withReturnTo(`/opportunities/${c.opportunity.id}`, listPath)}
                                className="text-foreground hover:underline"
                              >
                                {c.opportunity.title}
                              </Link>
                            </span>
                          ) : null}
                        </div>
                        {c.windowPeriods.length > 0 ? (
                          <ul className="mt-1 space-y-1 border-l border-border/70 pl-3 text-xs text-muted-foreground">
                            {c.windowPeriods.map((period) => (
                              <li
                                key={period.installmentId}
                                className="flex flex-wrap items-baseline justify-between gap-2"
                              >
                                <span>
                                  第 {period.periodNumber} 期
                                  {period.dueAt
                                    ? ` · 计划 ${period.dueAt.toISOString().slice(0, 10)}`
                                    : ""}
                                  {period.overdue ? " · 已逾期" : ""}
                                  {" · "}
                                  {period.collectionStatusLabel}
                                </span>
                                <span className="shrink-0 tabular-nums text-foreground">
                                  待收 {formatAmount(period.remainingAmount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
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
                        {SIGNED_CONTRACT_STATUSES.includes(c.status) ? (
                          <p>
                            <span className="text-muted-foreground">待催余额 </span>
                            <span className="font-medium">
                              {formatAmount(c.analysis.collectibleRemaining)}
                            </span>
                          </p>
                        ) : null}
                        <p>
                          <Link href={href} className="text-primary hover:underline">
                            查看合同
                          </Link>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
