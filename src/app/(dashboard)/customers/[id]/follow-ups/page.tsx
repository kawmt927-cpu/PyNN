import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import {
  getCustomerForUser,
  canManageCustomerOwner,
} from "@/lib/customers/access";
import {
  CONFIG_CATEGORY,
  labelForConfig,
  loadCustomerFieldLabelMaps,
  loadInteractionFormOptions,
} from "@/lib/config-options";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpForm } from "@/components/customers/follow-up-form";
import { FollowUpHistoryList } from "@/components/customers/follow-up-history-list";
import { BackLink } from "@/components/navigation/back-link";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import {
  countCustomerFollowUps,
  getCustomerFollowUpHistory,
} from "@/lib/follow-ups/unified";
import { selfReturnPath, withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CustomerFollowUpsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  const customer = await getCustomerForUser(id, session.user.role, session.user.id);
  if (!customer) notFound();

  const canManage = canManageCustomerOwner(session.user.role);
  const canEdit = customer.ownerId === session.user.id || canManage;

  const [followUps, followUpCount, labelMaps, formOptions] = await Promise.all([
    getCustomerFollowUpHistory(id, 50),
    countCustomerFollowUps(id),
    loadCustomerFieldLabelMaps(),
    loadInteractionFormOptions(),
  ]);

  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};

  const selfPath = selfReturnPath(`/customers/${id}/follow-ups`, query);
  const detailHref = selfReturnPath(`/customers/${id}`, query);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">客户跟进</h1>
          <p className="mt-1 text-muted-foreground">
            {customer.name} · {CUSTOMER_CATEGORY_LABELS[customer.category]}
            {customer.customerType && ` · ${labelForConfig(typeLabels, customer.customerType)}`}
            {customer.customerGrade ? (
              <>
                {" · "}
                <CustomerGradeIcon
                  grade={customer.customerGrade}
                  showLabel
                  labelMap={gradeLabels}
                  className="inline-flex"
                />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <BackLink href={detailHref} />
          <Button asChild variant="outline">
            <Link href={withReturnTo("/follow-ups", selfPath)}>待跟进列表</Link>
          </Button>
        </div>
      </div>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">新增跟进</CardTitle>
          </CardHeader>
          <CardContent>
            <FollowUpForm
              customerId={customer.id}
              customerName={customer.name}
              currentCustomerGrade={customer.customerGrade}
              stageOptions={formOptions.stageOptions}
              gradeOptions={formOptions.gradeOptions}
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
          <FollowUpHistoryList followUps={followUps} linkReturnTo={selfPath} />
        </CardContent>
      </Card>
    </div>
  );
}
