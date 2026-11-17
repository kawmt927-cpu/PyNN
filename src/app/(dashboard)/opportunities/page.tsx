import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canEditOpportunityContent,
  canFollowUpOpportunity,
  canManageOpportunityOwner,
  canRestoreOpportunity,
  canViewAllOpportunities,
} from "@/lib/opportunities/access";
import { getOpportunityFunnelSummary } from "@/lib/opportunities/funnel";
import {
  buildOpportunityListWhere,
  opportunityListTitle,
  parseOpportunityListFilters,
  parseOpportunityListSort,
} from "@/lib/opportunities/list-filters";
import { getOpportunityVisitSummaries } from "@/lib/opportunities/visit-summary";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  getConfigOptions,
} from "@/lib/config-options";
import {
  canAbandonOpportunity,
  canAddOpportunityQuote,
  canSignOpportunity,
} from "@/lib/opportunities/status";
import { canEditContract } from "@/lib/contracts/access";
import { OpportunityFunnelSummary } from "@/components/opportunities/opportunity-funnel-summary";
import {
  OpportunityListPanel,
  type OpportunityListRow,
  type OpportunityListVisit,
} from "@/components/opportunities/opportunity-list-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";

type Props = {
  searchParams: Promise<{
    view?: string;
    status?: string;
    stage?: string;
    ownerId?: string;
    grade?: string;
    sort?: string;
    dir?: string;
    q?: string;
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

export default async function OpportunitiesPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const rawParams = await searchParams;

  const filters = parseOpportunityListFilters(rawParams);
  const sort = parseOpportunityListSort(rawParams);
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
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      take: 100,
    }),
    showFunnel
      ? getOpportunityFunnelSummary(
          buildOpportunityListWhere(session.user.role, session.user.id, {
            q: "",
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
    opportunityRows.map((opp) => ({
      id: opp.id,
      grade: opp.grade,
      createdAt: opp.createdAt,
    }))
  );

  const stageOrder = Object.fromEntries(
    stageOrderRows.map((row) => [row.value, row.sortOrder])
  );
  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_GRADE] ?? {};

  const rows: OpportunityListRow[] = opportunityRows.map((opp) => {
    const canEdit = canEditOpportunityContent(
      session.user.role,
      session.user.id,
      opp
    );
    return {
      id: opp.id,
      title: opp.title,
      status: opp.status,
      stage: opp.stage,
      grade: opp.grade,
      expectedAmount: Number(opp.expectedAmount),
      expectedCloseDate: opp.expectedCloseDate.toISOString(),
      createdAt: opp.createdAt.toISOString(),
      customer: opp.customer
        ? { id: opp.customer.id, name: opp.customer.name }
        : null,
      owner: { id: opp.owner.id, name: opp.owner.name },
      canEdit,
      canFollowUp: canFollowUpOpportunity(
        session.user.role,
        session.user.id,
        opp
      ),
      canSign: canSignOpportunity(opp.status) && canEditContract(session.user.role),
      canAbandon: canAbandonOpportunity(opp.status),
      canRestore: canRestoreOpportunity(session.user.role),
      canAddQuote: canAddOpportunityQuote(opp.status) && canEdit,
      canAssign: canAssign && Boolean(opp.customer?.id),
    };
  });

  const visits: Record<string, OpportunityListVisit> = {};
  for (const [id, summary] of visitSummaries) {
    visits[id] = {
      lastVisitAt: summary.lastVisitAt?.toISOString() ?? null,
      lastVisitContent: summary.lastVisitContent,
      nextVisitAt: summary.nextVisitAt?.toISOString() ?? null,
      nextVisitContent: summary.nextVisitContent,
      nextVisitFromGrade: summary.nextVisitFromGrade,
    };
  }

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

      <OpportunityListPanel
        title={opportunityListTitle(filters)}
        emptyMessage={emptyMessage(filters)}
        filters={filters}
        initialSort={sort}
        rows={rows}
        visits={visits}
        stageOrder={stageOrder}
        stageLabels={stageLabels}
        gradeLabels={gradeLabels}
        stageOptions={stageOptions}
        gradeOptions={gradeOptions}
        showOwnerFilter={showOwnerFilter}
        salesUsers={salesUsers}
      />
    </div>
  );
}
