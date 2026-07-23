import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import {
  opportunityListWhereWithView,
  resolveOpportunityListView,
} from "@/lib/opportunities/access";
import {
  CONFIG_CATEGORY,
  getConfigOptionMaps,
  getConfigOptions,
  labelForConfig,
} from "@/lib/config-options";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { MobileSearchForm } from "@/components/mobile/mobile-search-form";
import { MobileCreateOpportunityButton } from "@/components/mobile/mobile-create-opportunity-button";
import { scoreNameMatch } from "@/lib/search/fuzzy-text";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function MobileOpportunitiesPage({ searchParams }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const view = resolveOpportunityListView("not_signed");
  const accessWhere = opportunityListWhereWithView(session.user.role, session.user.id, view);

  const where: Prisma.OpportunityWhereInput = accessWhere;

  const [raw, labelMaps, stageOptions] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { name: true } },
      },
      take: q ? 120 : 50,
    }),
    getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
  ]);

  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const opportunities = q
    ? raw
        .map((o) => ({
          o,
          score: Math.max(scoreNameMatch(q, o.title), scoreNameMatch(q, o.customer.name)),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40)
        .map((item) => item.o)
    : raw;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link
            href="/mobile/more"
            className="shrink-0 text-sm text-muted-foreground active:text-foreground"
          >
            返回
          </Link>
          <h1 className="min-w-0 flex-1 text-lg font-bold">商机</h1>
        </div>
        <MobileSearchForm
          action="/mobile/opportunities"
          placeholder="搜索商机或客户"
          defaultValue={q}
          trailing={<MobileCreateOpportunityButton stageOptions={stageOptions} />}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8">
        {opportunities.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {q ? "未找到匹配商机" : "暂无未签约商机，可点右上角新增"}
          </p>
        ) : (
          <ul className="space-y-2">
            {opportunities.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/mobile/opportunities/${o.id}`}
                  className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/50"
                >
                  <p className="font-medium">{o.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.customer.name}
                    {o.stage ? ` · ${labelForConfig(stageLabels, o.stage) || o.stage}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {OPPORTUNITY_STATUS_LABELS[o.status]}
                    {` · ${formatAmount(o.expectedAmount)}`}
                    {o.owner?.name ? ` · ${o.owner.name}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">签约 / 放弃请在电脑端操作</p>
      </div>
    </div>
  );
}
