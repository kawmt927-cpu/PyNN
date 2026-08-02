import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canEditOpportunityContent,
  canFollowUpOpportunity,
  canManageOpportunityOwner,
  canManageOpportunityStatus,
  canViewAllOpportunities,
} from "@/lib/opportunities/access";
import { getOpportunityFunnelSummary } from "@/lib/opportunities/funnel";
import {
  buildOpportunityListWhere,
  buildOpportunityListHref,
  opportunityListTitle,
  parseOpportunityListFilters,
  parseOpportunityListSort,
} from "@/lib/opportunities/list-filters";
import { sortOpportunitiesWithVisits } from "@/lib/opportunities/list-sort";
import { getOpportunityVisitSummaries } from "@/lib/opportunities/visit-summary";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  getConfigOptions,
  labelForConfig,
} from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import {
  canAbandonOpportunity,
  canAddOpportunityQuote,
  canSignOpportunity,
} from "@/lib/opportunities/status";
import { canEditContract } from "@/lib/contracts/access";
import { formatAmountInWan } from "@/lib/opportunities/funnel";
import { OpportunityFunnelSummary } from "@/components/opportunities/opportunity-funnel-summary";
import { OpportunityListFilters as OpportunityListFiltersPanel } from "@/components/opportunities/opportunity-list-filters";
import { OpportunityStatusCheckboxes } from "@/components/opportunities/opportunity-status-checkboxes";
import { OpportunityGradeIcon } from "@/components/opportunities/opportunity-grade-icon";
import { OpportunityRowActions } from "@/components/opportunities/opportunity-row-actions";
import { OpportunitySortableTh } from "@/components/opportunities/opportunity-sortable-th";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import { withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{
    view?: string;
    status?: string;
    stage?: string;
    ownerId?: string;
    grade?: string;
    sort?: string;
    dir?: string;
  }>;
};

function emptyMessage(filters: { statuses: string[] }) {
  if (filters.statuses.length === 0) {
    return "暂无商机，点击「新建商机」开始录入。";
  }
  if (filters.statuses.length === 1 && filters.statuses[0] === "NOT_SIGNED") {
    return "暂无未签约商机，点击「新建商机」开始录入。";
  }
  if (filters.statuses.length === 1 && filters.statuses[0] === "SIGNED") {
    return "暂无已签约商机。";
  }
  if (filters.statuses.length === 1 && filters.statuses[0] === "ABANDONED") {
    return "暂无已放弃商机。";
  }
  return "暂无符合筛选条件的商机。";
}

function formatVisitDate(value: Date | null | undefined) {
  if (!value) return "—";
  return format(value, "yyyy-MM-dd");
}

export default async function OpportunitiesPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const rawParams = await searchParams;

  const filters = parseOpportunityListFilters(rawParams);
  const sort = parseOpportunityListSort(rawParams);
  const listPath = buildOpportunityListHref(filters, sort);
  const accessWhere = buildOpportunityListWhere(
    session.user.role,
    session.user.id,
    filters
  );
  const showFunnel = canViewAllOpportunities(session.user.role);
  const showOwnerFilter = canManageOpportunityOwner(session.user.role);
  const canAssign = canManageWeeklyAssignments(session.user.role);

  const [
    opportunityRows,
    funnelLayers,
    labelMaps,
    stageOptions,
    gradeOptions,
    salesUsers,
    stageOrderRows,
  ] = await Promise.all([
    prisma.opportunity.findMany({
      where: accessWhere,
      orderBy: { updatedAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      take: 100,
    }),
    showFunnel
      ? getOpportunityFunnelSummary(
          buildOpportunityListWhere(session.user.role, session.user.id, {
            statuses: [],
            stages: [],
            ownerIds: filters.ownerIds,
            grades: [],
          })
        )
      : Promise.resolve([]),
    getConfigOptionMaps([
      CONFIG_CATEGORY.OPPORTUNITY_STAGE,
      CONFIG_CATEGORY.OPPORTUNITY_GRADE,
    ]),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_GRADE),
    showOwnerFilter
      ? listSalesUsersForSelect({
          viewer: { id: session.user.id, role: session.user.role },
          roles: ["SALES", "SALES_MANAGER", "ADMIN"],
        })
      : Promise.resolve([]),
    prisma.configOption.findMany({
      where: { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, enabled: true },
      select: { value: true, sortOrder: true },
    }),
  ]);

  const visitSummaries = await getOpportunityVisitSummaries(
    opportunityRows.map((opp) => opp.id)
  );

  const stageOrder = Object.fromEntries(
    stageOrderRows.map((row) => [row.value, row.sortOrder])
  );
  const opportunities = sortOpportunitiesWithVisits(
    opportunityRows,
    sort,
    visitSummaries,
    stageOrder
  );

  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_GRADE] ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">商机管理</h1>

      {showFunnel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">销售漏斗</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              未签约各阶段 + 已签约；序号小的更接近成单
            </p>
          </CardHeader>
          <CardContent>
            <OpportunityFunnelSummary layers={funnelLayers} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">
            {opportunityListTitle(filters)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({opportunities.length})
            </span>
          </CardTitle>
          <OpportunityStatusCheckboxes filters={filters} sort={sort} />
        </CardHeader>
        <CardContent className="space-y-4">
          <OpportunityListFiltersPanel
            filters={filters}
            sort={sort}
            stageOptions={stageOptions}
            gradeOptions={gradeOptions}
            showOwnerFilter={showOwnerFilter}
            salesUsers={salesUsers}
          />

          {opportunities.length === 0 ? (
            <p className="text-muted-foreground">{emptyMessage(filters)}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">商机名称</th>
                    <OpportunitySortableTh
                      label="等级"
                      column="grade"
                      filters={filters}
                      sort={sort}
                    />
                    <th className="pb-2 pr-4">销售对象</th>
                    <OpportunitySortableTh
                      label="预计金额"
                      column="amount"
                      filters={filters}
                      sort={sort}
                    />
                    <OpportunitySortableTh
                      label="阶段"
                      column="stage"
                      filters={filters}
                      sort={sort}
                    />
                    <OpportunitySortableTh
                      label="上次拜访"
                      column="lastVisit"
                      filters={filters}
                      sort={sort}
                    />
                    <OpportunitySortableTh
                      label="下次拜访"
                      column="nextVisit"
                      filters={filters}
                      sort={sort}
                    />
                    <th className="pb-2 pr-4">状态</th>
                    <th className="pb-2 pr-4">负责销售</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp) => {
                    const visit = visitSummaries.get(opp.id);
                    const canEdit = canEditOpportunityContent(
                      session.user.role,
                      session.user.id,
                      opp
                    );
                    const canFollowUp = canFollowUpOpportunity(
                      session.user.role,
                      session.user.id,
                      opp
                    );
                    const canManageStatus = canManageOpportunityStatus(session.user.role);
                    const isAbandoned = opp.status === "ABANDONED";
                    const canSign =
                      canSignOpportunity(opp.status) && canEditContract(session.user.role);
                    const canAbandon = canAbandonOpportunity(opp.status);
                    const canAddQuote = canAddOpportunityQuote(opp.status);

                    return (
                      <tr key={opp.id} className="border-b">
                        <td className="py-3 pr-4 font-medium">
                          <Link
                            href={withReturnTo(`/opportunities/${opp.id}`, listPath)}
                            className="text-primary hover:underline"
                          >
                            {opp.title}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <OpportunityGradeIcon
                            grade={opp.grade}
                            size="sm"
                            labelMap={gradeLabels}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          {opp.customer ? (
                            <Link
                              href={withReturnTo(`/customers/${opp.customer.id}`, listPath)}
                              className="text-primary hover:underline"
                            >
                              {opp.customer.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">{formatAmountInWan(opp.expectedAmount)}</td>
                        <td className="py-3 pr-4">{labelForConfig(stageLabels, opp.stage)}</td>
                        <td className="py-3 pr-4">
                          {visit?.lastVisitAt ? (
                            <span
                              className="cursor-default underline decoration-dotted underline-offset-2"
                              title={visit.lastVisitContent ?? undefined}
                            >
                              {formatVisitDate(visit.lastVisitAt)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {visit?.nextVisitAt ? (
                            <span
                              className="cursor-default underline decoration-dotted underline-offset-2"
                              title={visit.nextVisitContent ?? undefined}
                            >
                              {formatVisitDate(visit.nextVisitAt)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 pr-4">{OPPORTUNITY_STATUS_LABELS[opp.status]}</td>
                        <td className="py-3 pr-4">{opp.owner.name}</td>
                        <td className="py-3">
                          <OpportunityRowActions
                            opportunityId={opp.id}
                            customerId={opp.customer?.id}
                            returnTo={listPath}
                            canEdit={canEdit}
                            canFollowUp={canFollowUp}
                            canSign={canSign}
                            canAbandon={canAbandon}
                            canManageStatus={canManageStatus}
                            canAddQuote={canAddQuote}
                            canAssign={canAssign && Boolean(opp.customer?.id)}
                            isAbandoned={isAbandoned}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
