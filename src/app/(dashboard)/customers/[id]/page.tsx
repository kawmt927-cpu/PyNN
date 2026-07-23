import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getPrismaClient } from "@/lib/prisma";
import {
  getCustomerForUser,
  canManageCustomerOwner,
  canEditCustomerContent,
  listCustomerAssignableUsers,
} from "@/lib/customers/access";
import {
  HOSPITAL_LEVEL_LABELS,
} from "@/lib/permissions";
import {
  CONFIG_CATEGORY,
  labelForConfig,
  loadContactFormOptions,
  getConfigOptionMaps,
} from "@/lib/config-options";
import { countCustomerFollowUps, getCustomerFollowUpHistory } from "@/lib/follow-ups/unified";
import { getCustomerGradeFollowUpSchedule } from "@/lib/customers/grade-expiry";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";
import {
  contractListWhere,
  opportunityListWhere,
} from "@/lib/opportunities/access";
import { canEditContract } from "@/lib/contracts/access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpHistoryList } from "@/components/customers/follow-up-history-list";
import { CustomerContactsCard } from "@/components/customers/customer-contacts-card";
import { CustomerRelationsCard } from "@/components/customers/customer-relations-card";
import { CustomerOpportunitiesList } from "@/components/customers/customer-opportunities-list";
import { CustomerContractsList } from "@/components/customers/customer-contracts-list";
import { CustomerOwnerPanel } from "@/components/customers/customer-owner-panel";
import { CustomerApplyPanel } from "@/components/customers/customer-apply-panel";
import { BackLink } from "@/components/navigation/back-link";
import { CustomerMetaLine, CustomerGradeMetaBadge } from "@/components/customers/customer-meta-line";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { CustomerGradeFollowUpRemaining } from "@/components/customers/customer-grade-follow-up-remaining";
import { CustomerTagList } from "@/components/customers/customer-tag-badge";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";
import {
  resolveBackNavigation,
  selfReturnPath,
  withReturnTo,
} from "@/lib/navigation/return-to";
import {
  ENTITY_TYPES,
  listEntityOperationLogs,
} from "@/lib/audit/entity-operation-log";
import { EntityOperationLogList } from "@/components/audit/entity-operation-log-list";
import { AccessDeniedCard } from "@/components/navigation/access-denied-card";
import { customerExists } from "@/lib/customers/access-denied";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CustomerDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const db = getPrismaClient();
  if (!(await customerExists(id))) notFound();

  const customer = await getCustomerForUser(id, session.user.role, session.user.id);
  if (!customer) {
    const { backHref, backLabel } = resolveBackNavigation(query, "/customers");
    return (
      <div className="space-y-4">
        <AccessDeniedCard backHref={backHref} backLabel={backLabel} entityLabel="该客户" />
      </div>
    );
  }

  const canManage = canManageCustomerOwner(session.user.role);
  const inPool = customer.ownerId === null;
  const isSales = session.user.role === "SALES";


  const [salesUsers, labelMaps, tagDefinitions, contactFormOptions, pendingClaimForSales, pendingClaimCount, followUpCount, opportunities, contracts, followUps, gradeFollowUpSchedule, operationLogs] =
    await Promise.all([
      canManage
        ? listCustomerAssignableUsers({
            includeUserIds: customer.ownerId ? [customer.ownerId] : [],
          })
        : Promise.resolve([]),
      getConfigOptionMaps([
        CONFIG_CATEGORY.CUSTOMER_SOURCE,
        CONFIG_CATEGORY.CUSTOMER_TYPE,
        CONFIG_CATEGORY.CUSTOMER_GRADE,
        CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE,
        CONFIG_CATEGORY.OPPORTUNITY_STAGE,
      ]),
      getCustomerTagDefinitions(),
      loadContactFormOptions(),
      isSales && inPool
        ? db.customerClaimRequest.findFirst({
            where: {
              customerId: customer.id,
              requesterId: session.user.id,
              status: "PENDING",
            },
          })
        : Promise.resolve(null),
      canManage && inPool
        ? db.customerClaimRequest.count({
            where: { customerId: customer.id, status: "PENDING" },
          })
        : Promise.resolve(0),
      countCustomerFollowUps(customer.id),
      db.opportunity.findMany({
        where: {
          customerId: customer.id,
          ...opportunityListWhere(session.user.role, session.user.id),
        },
        orderBy: { updatedAt: "desc" },
        include: { owner: { select: { name: true } } },
      }),
      db.contract.findMany({
        where: {
          OR: [{ signCustomerId: customer.id }, { endUserCustomerId: customer.id }],
          ...contractListWhere(session.user.role, session.user.id),
        },
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { name: true } },
          opportunity: { select: { id: true, title: true } },
        },
      }),
      getCustomerFollowUpHistory(customer.id),
      getCustomerGradeFollowUpSchedule({
        customerId: customer.id,
        customerGrade: customer.customerGrade,
        customerCreatedAt: customer.createdAt,
        customerType: customer.customerType,
      }),
      listEntityOperationLogs(ENTITY_TYPES.CUSTOMER, customer.id),
    ]);

  const sourceLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_SOURCE] ?? {};
  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const isChannel = isChannelCustomerType(customer.customerType, typeLabels);
  const gradeLabels =
    (isChannel
      ? labelMaps[CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE]
      : labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE]) ?? {};
  const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};

  const relations = [
    ...customer.relationsFrom.map((r) => ({
      relationId: r.id,
      customer: r.relatedCustomer,
      relationNote: r.relationNote,
    })),
    ...customer.relationsTo.map((r) => ({
      relationId: r.id,
      customer: r.customer,
      relationNote: r.relationNote,
    })),
  ];

  const relationExcludeIds = [
    customer.id,
    ...customer.relationsFrom.map((r) => r.relatedCustomerId),
    ...customer.relationsTo.map((r) => r.customerId),
  ];

  const location = [customer.province, customer.city, customer.district]
    .filter(Boolean)
    .join(" ");

  const canEdit = canEditCustomerContent(session.user.role, session.user.id, customer);
  const canCreateContract = canEditContract(session.user.role) && canEdit;

  const customerTagValues = customer.tags.map((item) => item.tagValue);

  const { backHref, backLabel } = resolveBackNavigation(query, "/customers");
  const selfPath = selfReturnPath(`/customers/${id}`, query);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold">{customer.name}</h1>
            <CustomerGradeMetaBadge
              grade={customer.customerGrade}
              labelMap={gradeLabels}
              tone={isChannel ? "blue" : "amber"}
            />
          </div>
          <CustomerMetaLine
            className="mt-1"
            category={customer.category}
            customerType={customer.customerType}
            typeLabels={typeLabels}
            gradeFollowUpSchedule={gradeFollowUpSchedule}
          />
          {customerTagValues.length > 0 ? (
            <CustomerTagList
              tags={customerTagValues}
              definitions={tagDefinitions}
              className="mt-2"
            />
          ) : null}
        </div>
        <div className="flex gap-2">
          <BackLink href={backHref} label={backLabel} />
          <Button asChild variant={canEdit ? "default" : "outline"}>
            <Link href={withReturnTo(`/customers/${customer.id}/follow-ups`, selfPath)}>
              {canEdit ? "客户跟进" : "查看跟进"}
            </Link>
          </Button>
          {canEdit && (
            <Button asChild>
              <Link href={withReturnTo(`/customers/${customer.id}/edit`, selfPath)}>编辑</Link>
            </Button>
          )}
        </div>
      </div>

      <CustomerOwnerPanel
        customerId={customer.id}
        ownerId={customer.ownerId}
        ownerName={customer.owner?.name ?? null}
        assistantNames={customer.assistantOwners.map((row) => row.user.name)}
        role={session.user.role}
        salesUsers={salesUsers}
      />

      {isSales && inPool && (
        <CustomerApplyPanel
          customerId={customer.id}
          hasPendingRequest={Boolean(pendingClaimForSales)}
        />
      )}

      {canManage && inPool && pendingClaimCount > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          该客户有 {pendingClaimCount} 条待审批认领申请。
          <Link
            href={`/approvals?customerId=${customer.id}`}
            className="ml-2 font-medium text-primary hover:underline"
          >
            前往审批中心处理
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="负责人" value={customer.owner?.name ?? "公海池"} />
            <Row label="地区" value={location || "—"} />
            {customer.category === "HOSPITAL" && (
              <>
                <Row
                  label="医院等级"
                  value={
                    customer.hospitalLevel
                      ? HOSPITAL_LEVEL_LABELS[customer.hospitalLevel]
                      : "—"
                  }
                />
                <Row label="床位数" value={customer.bedCount?.toString() ?? "—"} />
              </>
            )}
            <Row label="现有系统" value={customer.existingSystem ?? "—"} />
            <Row label="关系类型" value={labelForConfig(typeLabels, customer.customerType)} />
            <Row
              label={isChannel ? "渠道等级" : "客户等级"}
              value={
                customer.customerGrade ? (
                  <CustomerGradeIcon
                    grade={customer.customerGrade}
                    labelMap={gradeLabels}
                    tone={isChannel ? "blue" : "amber"}
                  />
                ) : (
                  "—"
                )
              }
            />
            {gradeFollowUpSchedule ? (
              <Row
                label="拜访剩余"
                value={<CustomerGradeFollowUpRemaining schedule={gradeFollowUpSchedule} />}
              />
            ) : null}
            <Row label="客户来源" value={labelForConfig(sourceLabels, customer.source)} />
            <Row label="备注" value={customer.notes ?? "—"} />
          </CardContent>
        </Card>

        <CustomerContactsCard
          customerId={customer.id}
          contacts={customer.contacts}
          readOnly={!canEdit}
          titleOptions={contactFormOptions.titleOptions}
          departmentOptions={contactFormOptions.departmentOptions}
          roleOptions={contactFormOptions.roleOptions}
          showDepartment={customer.category === "HOSPITAL"}
        />
      </div>

      <CustomerRelationsCard
        customerId={customer.id}
        relations={relations}
        excludeIds={relationExcludeIds}
        typeLabels={typeLabels}
        readOnly={!canEdit}
        linkReturnTo={selfPath}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">
            商机
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({opportunities.length})
            </span>
          </CardTitle>
          {canEdit ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={withReturnTo(
                  `/opportunities/new?customerId=${customer.id}`,
                  selfPath
                )}
              >
                新建商机
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <CustomerOpportunitiesList
            opportunities={opportunities}
            stageLabels={stageLabels}
            linkReturnTo={selfPath}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">
            合同
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({contracts.length})
            </span>
          </CardTitle>
          {canCreateContract ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={withReturnTo(`/contracts/new?customerId=${customer.id}`, selfPath)}
              >
                新建合同
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <CustomerContractsList
            customerId={customer.id}
            contracts={contracts}
            linkReturnTo={selfPath}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">
            拜访记录
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({followUpCount})
            </span>
          </CardTitle>
          {canEdit ? (
            <Button asChild variant="outline" size="sm">
              <Link href={withReturnTo(`/customers/${customer.id}/follow-ups`, selfPath)}>
                录入跟进
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <FollowUpHistoryList followUps={followUps} linkReturnTo={selfPath} />
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
