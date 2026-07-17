import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { getOpportunityForUser } from "@/lib/opportunities/access";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  labelForConfig,
} from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MobileOpportunityDetailPage({ params }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const { id } = await params;

  const opportunity = await getOpportunityForUser(id, session.user.role, session.user.id, {
    allowAssignedWeeklyTask: true,
  });
  if (!opportunity) notFound();

  const labelMaps = await getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]);
  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/mobile/opportunities" className="text-xs text-primary">
          ← 商机列表
        </Link>
        <h1 className="mt-1 text-lg font-bold">{opportunity.title}</h1>
        <p className="text-xs text-muted-foreground">
          {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
          {opportunity.stage
            ? ` · ${labelForConfig(stageLabels, opportunity.stage) || opportunity.stage}`
            : ""}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-8">
        <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">客户</dt>
            <dd>
              <Link
                href={`/mobile/customers/${opportunity.customer.id}`}
                className="font-medium text-primary"
              >
                {opportunity.customer.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">预计金额</dt>
            <dd className="font-medium">{formatAmount(opportunity.expectedAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">预计成交</dt>
            <dd>{formatExpectedCloseMonth(opportunity.expectedCloseDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">负责销售</dt>
            <dd>{opportunity.owner.name}</dd>
          </div>
          {opportunity.requirementDesc ? (
            <div>
              <dt className="text-xs text-muted-foreground">需求说明</dt>
              <dd className="whitespace-pre-wrap text-muted-foreground">
                {opportunity.requirementDesc}
              </dd>
            </div>
          ) : null}
          {opportunity.notes ? (
            <div>
              <dt className="text-xs text-muted-foreground">备注</dt>
              <dd className="whitespace-pre-wrap text-muted-foreground">{opportunity.notes}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">更新时间</dt>
            <dd className="text-muted-foreground">
              {format(opportunity.updatedAt, "yyyy-MM-dd HH:mm")}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          补跟进、改阶段、签约请在电脑端商机详情操作。
        </p>
      </div>
    </div>
  );
}
