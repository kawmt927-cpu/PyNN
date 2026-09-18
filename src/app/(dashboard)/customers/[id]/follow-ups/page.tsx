import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import {
  getCustomerForUser,
  canManageCustomerOwner,
  canEditCustomerContent,
  canEditCustomerFollowUp,
} from "@/lib/customers/access";
import { customerExists } from "@/lib/customers/access-denied";
import {
  CONFIG_CATEGORY,
  loadCustomerFieldLabelMaps,
} from "@/lib/config-options";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpHistoryList } from "@/components/customers/follow-up-history-list";
import {
  CustomerFollowUpCheckInSection,
} from "@/components/customers/customer-follow-up-check-in-section";
import { BackLink } from "@/components/navigation/back-link";
import { AccessDeniedCard } from "@/components/navigation/access-denied-card";
import { CustomerMetaLine, CustomerGradeMetaBadge } from "@/components/customers/customer-meta-line";
import {
  countCustomerFollowUps,
  getCustomerFollowUpHistory,
  getCustomerPendingFollowPlans,
  serializeCustomerPendingFollowPlan,
} from "@/lib/follow-ups/unified";
import { prisma } from "@/lib/prisma";
import {
  resolveBackNavigation,
  selfReturnPath,
  withReturnTo,
} from "@/lib/navigation/return-to";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; contactId?: string; opportunityId?: string }>;
};

export default async function CustomerFollowUpsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  if (!(await customerExists(id))) notFound();

  const customer = await getCustomerForUser(id, session.user.role, session.user.id, {
    allowAssignedWeeklyTask: true,
    allowFollowUpOnAnyCustomer: true,
  });
  if (!customer) {
    const { backHref, backLabel } = resolveBackNavigation(query, "/customers");
    return (
      <div className="space-y-4">
        <AccessDeniedCard backHref={backHref} backLabel={backLabel} entityLabel="该客户" />
      </div>
    );
  }

  const canManage = canManageCustomerOwner(session.user.role);
  const canEdit =
    session.user.role === "SALES" ||
    session.user.role === "SALES_MANAGER" ||
    session.user.role === "ADMIN" ||
    canEditCustomerFollowUp(session.user.role, session.user.id, customer);
  const isOwnerOrAssistant = canEditCustomerFollowUp(
    session.user.role,
    session.user.id,
    customer
  );

  const now = new Date();
  const opportunityId = query.opportunityId?.trim() || undefined;
  const contactId = query.contactId?.trim() || undefined;

  const [followUps, followUpCount, labelMaps, pendingPlans, opportunity] = await Promise.all([
    getCustomerFollowUpHistory(id, 50, {
      includePendingForViewer: true,
      viewerUserId: session.user.id,
    }),
    countCustomerFollowUps(id),
    loadCustomerFieldLabelMaps(),
    getCustomerPendingFollowPlans(id, now, { forUserId: session.user.id }),
    opportunityId
      ? prisma.opportunity.findFirst({
          where: { id: opportunityId, customerId: id },
          select: { id: true, title: true },
        })
      : Promise.resolve(null),
  ]);

  const serializedPendingPlans = pendingPlans.map(serializeCustomerPendingFollowPlan);
  const pendingOpportunity = pendingPlans.find((item) => item.opportunity)?.opportunity;

  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const isChannel = isChannelCustomerType(customer.customerType, typeLabels);
  const gradeLabels = isChannel
    ? labelMaps[CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE] ?? {}
    : labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};

  const selfPath = selfReturnPath(`/customers/${id}/follow-ups`, query);
  const detailHref = selfReturnPath(`/customers/${id}`, query);
  const { backHref, backLabel } = resolveBackNavigation(query, detailHref);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">客户跟进</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-base font-medium">{customer.name}</p>
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
          />
        </div>
        <div className="flex gap-2">
          <BackLink href={backHref} label={backLabel} />
          <Button asChild variant="outline">
            <Link href={withReturnTo("/follow-ups", selfPath)}>待跟进列表</Link>
          </Button>
        </div>
      </div>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">往来打卡</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isOwnerOrAssistant && session.user.role === "SALES" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                该客户非你负责。提交后为「待确认」，需销售管理确认后正式入库。
              </p>
            ) : null}
            <CustomerFollowUpCheckInSection
              role={session.user.role}
              customer={{
                id: customer.id,
                name: customer.name,
                customerType: customer.customerType,
                customerGrade: customer.customerGrade,
                contacts: customer.contacts.map((contact) => ({
                  id: contact.id,
                  isPrimary: contact.isPrimary,
                })),
              }}
              pendingPlans={serializedPendingPlans}
              returnPath={selfPath}
              initialContactId={contactId}
              initialOpportunityId={opportunity?.id ?? pendingOpportunity?.id}
              initialOpportunityLabel={opportunity?.title ?? pendingOpportunity?.title}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          您暂无权限为该客户录入跟进，仅可查看历史记录。
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            跟进记录
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({followUpCount})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FollowUpHistoryList
            followUps={followUps}
            linkReturnTo={selfPath}
            canDelete={canManage}
            customerId={customer.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
