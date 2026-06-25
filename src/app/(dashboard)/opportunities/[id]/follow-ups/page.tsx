import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canFollowUpOpportunityForUser,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  getConfigOptions,
} from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import { getOpportunityActivity } from "@/lib/opportunities/activity";
import { OpportunityFollowUpForm } from "@/components/opportunities/opportunity-follow-up-form";
import { OpportunityActivityList } from "@/components/opportunities/opportunity-activity-list";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { selfReturnPath, withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function OpportunityFollowUpsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id, {
    allowAssignedWeeklyTask: true,
  });
  if (!opportunity) notFound();

  const canFollowUp = await canFollowUpOpportunityForUser(
    session.user.role,
    session.user.id,
    opportunity
  );

  const [full, activity, labelMaps, stageOptions] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id } }),
    getOpportunityActivity(id),
    getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
  ]);
  if (!full) notFound();

  const selfPath = selfReturnPath(`/opportunities/${id}/follow-ups`, query);
  const detailHref = selfReturnPath(`/opportunities/${id}`, query);
  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
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
          <h1 className="text-2xl font-bold">商机跟进</h1>
          <p className="mt-1 text-muted-foreground">
            {opportunity.title} · {OPPORTUNITY_STATUS_LABELS[opportunity.status]} · 负责：
            {opportunity.owner.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            销售对象：
            <Link
              href={withReturnTo(`/customers/${opportunity.customerId}`, selfPath)}
              className="ml-1 text-primary hover:underline"
            >
              {opportunity.customer.name}
            </Link>
            <span className="mx-2">·</span>
            记录会同步计入
            <Link
              href={withReturnTo(`/customers/${opportunity.customerId}/follow-ups`, selfPath)}
              className="ml-1 text-primary hover:underline"
            >
              客户跟进
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BackLink href={detailHref} />
          <Button asChild variant="outline">
            <Link href={withReturnTo("/follow-ups", selfPath)}>待跟进列表</Link>
          </Button>
        </div>
      </div>

      {canFollowUp ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">新增跟进</CardTitle>
          </CardHeader>
          <CardContent>
            <OpportunityFollowUpForm
              mode="create"
              opportunityId={id}
              opportunity={opportunitySnapshot}
              stageOptions={stageOptions}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {opportunity.status === "ABANDONED"
            ? "该商机已放弃，无法新增跟进，仅可查看历史记录。"
            : opportunity.status === "SIGNED"
              ? "该商机已签约，无法新增跟进，仅可查看历史记录。"
              : "您暂无权限为该商机录入跟进，仅可查看历史记录。"}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            商机跟进记录
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({activity.length})
            </span>
          </CardTitle>
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
    </div>
  );
}
