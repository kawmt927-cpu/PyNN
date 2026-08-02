import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getOpportunityForUser,
  canEditOpportunityContent,
  canFollowUpOpportunity,
  canManageOpportunityStatus,
} from "@/lib/opportunities/access";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  getConfigOptions,
  labelForConfig,
} from "@/lib/config-options";
import { getOpportunityGradeLabel } from "@/lib/opportunities/grade";
import { listOpportunityRecentFollowUps } from "@/lib/opportunities/visit-summary";
import { OpportunityGradeDisplay } from "@/components/opportunities/opportunity-grade-icon";
import { FOLLOW_UP_METHOD_LABELS, OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import {
  OPPORTUNITY_ABANDON_REASON_LABELS,
  canSignOpportunity,
} from "@/lib/opportunities/status";
import { canEditContract } from "@/lib/contracts/access";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import { getOpportunityActivity } from "@/lib/opportunities/activity";
import { OpportunityActivityList } from "@/components/opportunities/opportunity-activity-list";
import { OpportunityRestoreStatusActions } from "@/components/opportunities/opportunity-restore-status-actions";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  resolveBackNavigation,
  selfReturnPath,
  withReturnTo,
} from "@/lib/navigation/return-to";
import { ENTITY_TYPES, listEntityOperationLogs } from "@/lib/audit/entity-operation-log";
import { EntityOperationLogList } from "@/components/audit/entity-operation-log-list";
import { DEAL_PARTY_ROLE_LABELS } from "@/lib/deals/party-roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function OpportunityDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id);
  if (!opportunity) notFound();

  const [full, activity, contracts, labelMaps, stageOptions, operationLogs, recentVisits] =
    await Promise.all([
      prisma.opportunity.findUnique({
        where: { id },
        include: {
          customer: true,
          owner: { select: { name: true } },
          parties: {
            include: { customer: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      getOpportunityActivity(id),
      prisma.contract.findMany({
        where: { opportunityId: id },
        select: { id: true, title: true, totalAmount: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE, CONFIG_CATEGORY.OPPORTUNITY_GRADE]),
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
      listEntityOperationLogs(ENTITY_TYPES.OPPORTUNITY, id),
      listOpportunityRecentFollowUps(id, 8),
    ]);

  if (!full) notFound();

  const { backHref, backLabel } = resolveBackNavigation(query, "/opportunities");
  const selfPath = selfReturnPath(`/opportunities/${id}`, query);
  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_GRADE] ?? {};
  const canEdit = canEditOpportunityContent(session.user.role, session.user.id, full);
  const canFollowUp = canFollowUpOpportunity(session.user.role, session.user.id, full);
  const canManageStatus = canManageOpportunityStatus(session.user.role);
  const isAbandoned = full.status === "ABANDONED";
  const canSign = canSignOpportunity(full.status) && canEditContract(session.user.role);
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
          <BackLink href={backHref} label={backLabel} />
          {canSign && (
            <Button asChild>
              <Link href={withReturnTo(`/opportunities/${id}/create-contract`, selfPath)}>
                {full.status === "SIGNED" ? "再建合同（拆分）" : "签订销售合同"}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={withReturnTo(`/opportunities/${id}/follow-ups`, selfPath)}>
              {canFollowUp ? "商机跟进" : "查看跟进"}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">商机信息</CardTitle>
            {canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link href={withReturnTo(`/opportunities/${id}/edit`, selfPath)}>编辑</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">主要客户：</span>
              {full.customerId && full.customer ? (
                <Link
                  href={withReturnTo(`/customers/${full.customerId}`, selfPath)}
                  className="text-primary hover:underline"
                >
                  {full.customer.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">未指定</span>
              )}
            </p>
            {full.parties.length > 0 ? (
              <div>
                <p className="text-muted-foreground">关联客户</p>
                <ul className="mt-1 space-y-1">
                  {full.parties.map((p) => (
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
            <p>
              <span className="text-muted-foreground">商机等级：</span>
              <OpportunityGradeDisplay
                grade={full.grade ?? "P3"}
                description={getOpportunityGradeLabel(full.grade ?? "P3", gradeLabels)}
                size="sm"
                className="inline-flex align-middle"
              />
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
                    <Link
                      href={withReturnTo(`/contracts/${c.id}`, selfPath)}
                      className="text-primary hover:underline"
                    >
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
          <CardTitle className="text-lg">最近拜访</CardTitle>
        </CardHeader>
        <CardContent>
          {recentVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无关联的客户拜访记录。</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {recentVisits.map((visit) => (
                <li key={visit.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(visit.followUpAt, "yyyy-MM-dd HH:mm")}</span>
                    <span>{visit.user.name}</span>
                    <span>{FOLLOW_UP_METHOD_LABELS[visit.method]}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{visit.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">商机跟进记录</CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunityActivityList
            items={activity}
            stageLabels={stageLabels}
            canEditFollowUps={canFollowUp}
            opportunityId={id}
            opportunity={opportunitySnapshot}
            stageOptions={stageOptions}
          />
        </CardContent>
      </Card>

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
