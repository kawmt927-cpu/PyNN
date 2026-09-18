import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import {
  canEditCustomerContent,
  canManageCustomerOwner,
  getCustomerForUser,
} from "@/lib/customers/access";
import { customerExists } from "@/lib/customers/access-denied";
import {
  CONFIG_CATEGORY,
  labelForConfig,
  loadCustomerFieldLabelMaps,
  loadContactFormOptions,
  getConfigOptionMaps,
  getConfigOptions,
} from "@/lib/config-options";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { CustomerTagList } from "@/components/customers/customer-tag-badge";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";
import { AccessDeniedCard } from "@/components/navigation/access-denied-card";
import {
  listContractsLinkedToCustomer,
  listOpportunitiesLinkedToCustomer,
} from "@/lib/customers/linked-deals";
import { formatAmount } from "@/lib/opportunities/funnel";
import { OPPORTUNITY_STATUS_LABELS, CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";
import { CustomerContactsCard } from "@/components/customers/customer-contacts-card";
import { MobileNationwideChannelToggle } from "@/components/mobile/mobile-nationwide-channel-toggle";
import { MobileCreateOpportunityButton } from "@/components/mobile/mobile-create-opportunity-button";

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

  const [labelMaps, stageMaps, tagDefs, contactFormOptions, stageOptions, opportunities, contracts] =
    await Promise.all([
      loadCustomerFieldLabelMaps(),
      getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]),
      getCustomerTagDefinitions(),
      loadContactFormOptions(),
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
      listOpportunitiesLinkedToCustomer({
        customerId: id,
        role: session.user.role,
        userId: session.user.id,
        take: 10,
      }),
      listContractsLinkedToCustomer({
        customerId: id,
        role: session.user.role,
        userId: session.user.id,
        take: 10,
      }),
    ]);

  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const stageLabels = stageMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
  const tagValues = customer.tags.map((t) => t.tagValue);
  const canEdit = canEditCustomerContent(session.user.role, session.user.id, customer);
  const isChannel = isChannelCustomerType(customer.customerType, typeLabels);
  const gradeLabels = isChannel
    ? labelMaps[CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE] ?? {}
    : labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};
  const canToggleNationwide = canManageCustomerOwner(session.user.role) && isChannel;
  const responsibleProvinces = [
    ...new Set(
      customer.contacts.flatMap((c) => c.responsibleProvinces.map((r) => r.province))
    ),
  ];

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
            tone={isChannel ? "blue" : "amber"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {labelForConfig(typeLabels, customer.customerType) || "未分类"}
          {customer.owner?.name ? ` · ${customer.owner.name}` : ""}
          {customer.nationwideChannel ? " · 全国性渠道" : ""}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-8">
        <CustomerTagList tags={tagValues} definitions={tagDefs} />

        {isChannel ? (
          <section className="space-y-2 rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">全国性渠道</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {customer.nationwideChannel
                    ? "不按总部划省；按联系人负责省计入各省与 KPI。"
                    : "普通渠道按公司所在省划分。"}
                </p>
              </div>
              {canToggleNationwide ? (
                <MobileNationwideChannelToggle
                  customerId={customer.id}
                  nationwideChannel={customer.nationwideChannel}
                  contactProvinceCount={
                    customer.contacts.filter((c) => c.responsibleProvinces.length > 0).length
                  }
                />
              ) : (
                <span className="shrink-0 text-sm font-medium">
                  {customer.nationwideChannel ? "是" : "否"}
                </span>
              )}
            </div>
            {customer.nationwideChannel ? (
              <p className="text-xs text-muted-foreground">
                当前负责省：
                {responsibleProvinces.length > 0
                  ? responsibleProvinces.join("、")
                  : "尚未标注（请在下方联系人中选择）"}
              </p>
            ) : null}
          </section>
        ) : null}

        <CustomerContactsCard
          customerId={customer.id}
          contacts={customer.contacts}
          readOnly={!canEdit}
          titleOptions={contactFormOptions.titleOptions}
          departmentOptions={contactFormOptions.departmentOptions}
          roleOptions={contactFormOptions.roleOptions}
          showDepartment={customer.category === "HOSPITAL"}
          showResponsibleProvinces={isChannel && customer.nationwideChannel}
        />

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">商机（{opportunities.length}）</h2>
            {canEdit ? (
              <MobileCreateOpportunityButton
                stageOptions={stageOptions}
                initialCustomerId={customer.id}
                initialCustomerName={customer.name}
                buttonLabel="新建商机"
              />
            ) : null}
          </div>
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
                      {o.relationRoles.length > 0
                        ? `${o.relationRoles.join(" / ")} · `
                        : ""}
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
                      {c.relationRoles.length > 0
                        ? `${c.relationRoles.join(" / ")} · `
                        : ""}
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
          签约与复杂编辑请用电脑端；全国性渠道的负责省可在本页联系人中维护。
        </p>
      </div>
    </div>
  );
}
