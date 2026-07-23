import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canEditOpportunityContent,
  canFollowUpOpportunity,
  canManageOpportunityStatus,
  canViewAllOpportunities,
  opportunityListTabs,
  opportunityListViewLabel,
  opportunityListWhereWithView,
  resolveOpportunityListView,
} from "@/lib/opportunities/access";
import { getOpportunityFunnelSummary } from "@/lib/opportunities/funnel";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  labelForConfig,
} from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import {
  canAbandonOpportunity,
  canAddOpportunityQuote,
  canSignOpportunity,
} from "@/lib/opportunities/status";
import { canEditContract } from "@/lib/contracts/access";
import { formatAmount } from "@/lib/opportunities/funnel";
import { OpportunityFunnelSummary } from "@/components/opportunities/opportunity-funnel-summary";
import { OpportunityRowActions } from "@/components/opportunities/opportunity-row-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import {
  opportunityListPath,
  withReturnTo,
} from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{ view?: string }>;
};

const EMPTY_MESSAGES: Record<
  ReturnType<typeof resolveOpportunityListView>,
  string
> = {
  not_signed: "暂无未签约商机，点击「新建商机」开始录入。",
  signed: "暂无已签约商机。",
  abandoned: "暂无已放弃商机。",
  all: "暂无商机，点击「新建商机」开始录入。",
};

export default async function OpportunitiesPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const { view: rawView } = await searchParams;

  const view = resolveOpportunityListView(rawView);
  const tabs = opportunityListTabs();
  const listPath = opportunityListPath(view);
  const accessWhere = opportunityListWhereWithView(session.user.role, session.user.id, view);
  const showFunnel = canViewAllOpportunities(session.user.role) && view === "not_signed";

  const [opportunities, funnelRows, labelMaps] = await Promise.all([
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
      ? getOpportunityFunnelSummary(opportunityListWhereWithView(session.user.role, session.user.id))
      : Promise.resolve([]),
    getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]),
  ]);

  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">商机管理</h1>
        <Button asChild>
          <Link href="/opportunities/new">新建商机</Link>
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              view === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {showFunnel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">销售漏斗（未签约）</CardTitle>
          </CardHeader>
          <CardContent>
            <OpportunityFunnelSummary rows={funnelRows} stageLabels={stageLabels} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {opportunityListViewLabel(view)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({opportunities.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <p className="text-muted-foreground">{EMPTY_MESSAGES[view]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">商机名称</th>
                    <th className="pb-2 pr-4">销售对象</th>
                    <th className="pb-2 pr-4">预计金额</th>
                    <th className="pb-2 pr-4">预计签约月份</th>
                    <th className="pb-2 pr-4">阶段</th>
                    <th className="pb-2 pr-4">状态</th>
                    <th className="pb-2 pr-4">负责销售</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp) => {
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
                          <Link
                            href={withReturnTo(`/customers/${opp.customer.id}`, listPath)}
                            className="text-primary hover:underline"
                          >
                            {opp.customer.name}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">{formatAmount(opp.expectedAmount)}</td>
                        <td className="py-3 pr-4">
                          {formatExpectedCloseMonth(opp.expectedCloseDate)}
                        </td>
                        <td className="py-3 pr-4">{labelForConfig(stageLabels, opp.stage)}</td>
                        <td className="py-3 pr-4">{OPPORTUNITY_STATUS_LABELS[opp.status]}</td>
                        <td className="py-3 pr-4">{opp.owner.name}</td>
                        <td className="py-3">
                          <OpportunityRowActions
                            opportunityId={opp.id}
                            returnTo={listPath}
                            canEdit={canEdit}
                            canFollowUp={canFollowUp}
                            canSign={canSign}
                            canAbandon={canAbandon}
                            canManageStatus={canManageStatus}
                            canAddQuote={canAddQuote}
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
