import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { getCustomerForUser } from "@/lib/customers/access";
import { customerExists } from "@/lib/customers/access-denied";
import {
  CONFIG_CATEGORY,
  labelForConfig,
  loadCustomerFieldLabelMaps,
  getConfigOptionMaps,
} from "@/lib/config-options";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { CustomerTagList } from "@/components/customers/customer-tag-badge";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";
import { AccessDeniedCard } from "@/components/navigation/access-denied-card";
import { prisma } from "@/lib/prisma";
import {
  opportunityListWhere,
  contractListWhere,
} from "@/lib/opportunities/access";
import { formatAmount } from "@/lib/opportunities/funnel";
import { OPPORTUNITY_STATUS_LABELS, CONTRACT_STATUS_LABELS } from "@/lib/permissions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MobileCustomerDetailPage({ params }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const { id } = await params;

  if (!(await customerExists(id))) notFound();

  const customer = await getCustomerForUser(id, session.user.role, session.user.id);
  if (!customer) {
    return (
      <div className="space-y-4 p-4">
        <AccessDeniedCard
          backHref="/mobile/customers"
          backLabel="返回客户列表"
          entityLabel="该客户"
        />
      </div>
    );
  }

  const [labelMaps, stageMaps, tagDefs, opportunities, contracts] = await Promise.all([
    loadCustomerFieldLabelMaps(),
    getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]),
    getCustomerTagDefinitions(),
    prisma.opportunity.findMany({
      where: {
        AND: [opportunityListWhere(session.user.role, session.user.id), { customerId: id }],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        stage: true,
        expectedAmount: true,
      },
    }),
    prisma.contract.findMany({
      where: {
        AND: [
          contractListWhere(session.user.role, session.user.id),
          {
            OR: [{ signCustomerId: id }, { endUserCustomerId: id }],
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, title: true, status: true, totalAmount: true },
    }),
  ]);

  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};
  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const stageLabels = stageMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const contacts = customer.contacts.slice(0, 20);
  const tagValues = customer.tags.map((t) => t.tagValue);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/mobile/customers" className="text-xs text-primary">
          ← 客户列表
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-lg font-bold">{customer.name}</h1>
          <CustomerGradeIcon
            grade={customer.customerGrade}
            size="sm"
            labelMap={gradeLabels}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {labelForConfig(typeLabels, customer.customerType) || "未分类"}
          {customer.owner?.name ? ` · ${customer.owner.name}` : ""}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-8">
        <CustomerTagList tags={tagValues} definitions={tagDefs} />

        <section className="space-y-2">
          <h2 className="text-sm font-medium">联系人（{contacts.length}）</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无联系人</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li key={c.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.title, c.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">商机（{opportunities.length}）</h2>
          {opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无商机</p>
          ) : (
            <ul className="space-y-2">
              {opportunities.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/mobile/opportunities/${o.id}`}
                    className="block rounded-lg border bg-card px-3 py-2 active:bg-muted/50"
                  >
                    <p className="text-sm font-medium">{o.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {OPPORTUNITY_STATUS_LABELS[o.status]}
                      {o.stage ? ` · ${labelForConfig(stageLabels, o.stage) || o.stage}` : ""}
                      {` · ${formatAmount(o.expectedAmount)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">合同（{contracts.length}）</h2>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无合同</p>
          ) : (
            <ul className="space-y-2">
              {contracts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/mobile/contracts/${c.id}`}
                    className="block rounded-lg border bg-card px-3 py-2 active:bg-muted/50"
                  >
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CONTRACT_STATUS_LABELS[c.status]}
                      {` · ${formatAmount(c.totalAmount)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <Link
            href={`/mobile/customers/${id}/follow-ups`}
            className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-medium active:bg-muted/50"
          >
            客户跟进
            <span className="text-xs font-normal text-muted-foreground">写跟进 / 查历史</span>
          </Link>
        </section>

        <p className="text-xs text-muted-foreground">
          新建客户、签约、复杂编辑可在本页「客户跟进」或「更多 → 客户」完成；签约请用电脑端。
        </p>
      </div>
    </div>
  );
}
