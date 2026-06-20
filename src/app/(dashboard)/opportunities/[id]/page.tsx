import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getOpportunityForUser,
  canEditOpportunityContent,
  canManageOpportunityStatus,
} from "@/lib/opportunities/access";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  getConfigOptions,
  labelForConfig,
} from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import {
  OPPORTUNITY_ABANDON_REASON_LABELS,
  canSignOpportunity,
} from "@/lib/opportunities/status";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import { getOpportunityActivity } from "@/lib/opportunities/activity";
import { OpportunityActivityList } from "@/components/opportunities/opportunity-activity-list";
import { OpportunityRestoreStatusActions } from "@/components/opportunities/opportunity-restore-status-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OpportunityDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id);
  if (!opportunity) notFound();

  const [full, activity, contracts, labelMaps, stageOptions] = await Promise.all([
      prisma.opportunity.findUnique({
        where: { id },
        include: {
          customer: true,
          owner: { select: { name: true } },
        },
      }),
      getOpportunityActivity(id),
      prisma.contract.findMany({
        where: { opportunityId: id },
        select: { id: true, title: true, totalAmount: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]),
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    ]);

  if (!full) notFound();

  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const canEdit = canEditOpportunityContent(session.user.role, session.user.id, full);
  const canManageStatus = canManageOpportunityStatus(session.user.role);
  const isAbandoned = full.status === "ABANDONED";
  const canSign = canSignOpportunity(full.status);
  const opportunitySnapshot = {
    stage: full.stage,
    expectedAmount: Number(full.expectedAmount),
    expectedCloseDate: full.expectedCloseDate,
    winProbability: full.winProbability,
    requirementDesc: full.requirementDesc,
    competitor: full.competitor,
    notes: full.notes,
    amountLocked: full.amountLocked,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{full.title}</h1>
          <p className="text-sm text-muted-foreground">
            {OPPORTUNITY_STATUS_LABELS[full.status]} · 负责：{full.owner.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/opportunities">返回列表</Link>
          </Button>
          {canEdit && (
            <Button asChild variant="outline">
              <Link href={`/opportunities/${id}/edit`}>编辑</Link>
            </Button>
          )}
          {canSign && (
            <Button asChild>
              <Link href={`/opportunities/${id}/create-contract`}>
                {full.status === "SIGNED" ? "再建合同（拆分）" : "签订销售合同"}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/opportunities/${id}/follow-ups`}>商机跟进</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">商机信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">销售对象：</span>
              <Link href={`/customers/${full.customerId}`} className="text-primary hover:underline">
                {full.customer.name}
              </Link>
            </p>
            <p>
              <span className="text-muted-foreground">预计金额：</span>
              {formatAmount(full.expectedAmount)}
              {full.amountLocked && (
                <span className="ml-2 text-xs text-muted-foreground">（已锁定）</span>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">预计签约月份：</span>
              {formatExpectedCloseMonth(full.expectedCloseDate)}
            </p>
            <p>
              <span className="text-muted-foreground">阶段：</span>
              {labelForConfig(stageLabels, full.stage)}
            </p>
            {full.winProbability != null && (
              <p>
                <span className="text-muted-foreground">赢单概率：</span>
                {full.winProbability}%
              </p>
            )}
            {full.competitor && (
              <p>
                <span className="text-muted-foreground">竞争对手：</span>
                {full.competitor}
              </p>
            )}
            {full.requirementDesc && (
              <div>
                <p className="text-muted-foreground">需求描述</p>
                <p className="mt-1 whitespace-pre-wrap">{full.requirementDesc}</p>
              </div>
            )}
            {full.status === "ABANDONED" && full.abandonReason && (
              <div>
                <p className="text-muted-foreground">放弃原因</p>
                <p className="mt-1">
                  {OPPORTUNITY_ABANDON_REASON_LABELS[full.abandonReason]}
                  {full.abandonNote && `：${full.abandonNote}`}
                </p>
              </div>
            )}
            {full.notes && (
              <div>
                <p className="text-muted-foreground">备注</p>
                <p className="mt-1 whitespace-pre-wrap">{full.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">关联合同</CardTitle>
          </CardHeader>
          <CardContent>
            {contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚未创建合同。</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {contracts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contracts/${c.id}`} className="text-primary hover:underline">
                      {c.title}
                    </Link>
                    <span className="ml-2 text-muted-foreground">
                      {formatAmount(c.totalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {isAbandoned && canManageStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">调整商机状态</CardTitle>
          </CardHeader>
          <CardContent>
            <OpportunityRestoreStatusActions opportunityId={id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">商机跟进记录</CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunityActivityList
            items={activity}
            stageLabels={stageLabels}
            canEditFollowUps={canEdit}
            opportunityId={id}
            opportunity={opportunitySnapshot}
            stageOptions={stageOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
