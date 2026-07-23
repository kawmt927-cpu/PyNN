import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import {
  getCustomerForUser,
  canEditCustomerFollowUp,
} from "@/lib/customers/access";
import { customerExists } from "@/lib/customers/access-denied";
import { getConfigOptions, CONFIG_CATEGORY } from "@/lib/config-options";
import {
  getCustomerFollowUpHistory,
  getCustomerPendingFollowPlans,
  serializeCustomerPendingFollowPlan,
} from "@/lib/follow-ups/unified";
import { FollowUpForm } from "@/components/customers/follow-up-form";
import { FollowUpHistoryList } from "@/components/customers/follow-up-history-list";
import { AccessDeniedCard } from "@/components/navigation/access-denied-card";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MobileCustomerFollowUpsPage({ params }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const { id } = await params;

  if (!(await customerExists(id))) notFound();

  const customer = await getCustomerForUser(id, session.user.role, session.user.id, {
    allowAssignedWeeklyTask: true,
  });
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

  const canEdit = canEditCustomerFollowUp(session.user.role, session.user.id, customer);
  const now = new Date();

  const [history, pendingPlans, stageOptions, gradeOptions] = await Promise.all([
    getCustomerFollowUpHistory(id, 30),
    getCustomerPendingFollowPlans(id, now),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_GRADE),
  ]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href={`/mobile/customers/${id}`} className="text-xs text-primary">
          ← {customer.name}
        </Link>
        <h1 className="mt-1 text-lg font-bold">客户跟进</h1>
        <p className="text-xs text-muted-foreground">
          {canEdit ? "可记录跟进（无需写日报）" : "仅可查阅历史"}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 pb-10">
        {canEdit ? (
          <FollowUpForm
            customerId={customer.id}
            customerName={customer.name}
            currentCustomerGrade={customer.customerGrade}
            stageOptions={stageOptions}
            gradeOptions={gradeOptions}
            pendingPlans={pendingPlans.map(serializeCustomerPendingFollowPlan)}
          />
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-medium">历史跟进</h2>
          <FollowUpHistoryList followUps={history} />
        </section>
      </div>
    </div>
  );
}
