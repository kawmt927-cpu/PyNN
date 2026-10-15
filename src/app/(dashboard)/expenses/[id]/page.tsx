import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_AUTHED_ROLES,
  EXPENSE_CLAIM_KIND_LABELS,
  expenseClaimChipStatus,
} from "@/lib/expenses/labels";
import { claimInclude, canViewClaim } from "@/lib/expenses/service";
import {
  editorModeForFlowStep,
  expenseApprovalStepLabel,
  getClaimCurrentStep,
  getClaimCurrentStepIndex,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";
import {
  getEffectiveExpenseTravelPolicy,
  listCityHotelHints,
} from "@/lib/expenses/travel-policy";
import { listExpenseFeeCategories } from "@/lib/expenses/fee-categories";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import {
  expenseEditorClaimProps,
  loadExpenseEditorOptions,
} from "@/lib/expenses/editor-options";
import {
  formatExpensePlaces,
  formatExpenseTimeRange,
} from "@/lib/expenses/list-rows";
import {
  buildExpenseApprovalProgressNodes,
  latestExpenseRejectInfo,
} from "@/lib/expenses/approval-progress";
import { ExpenseClaimEditor } from "@/components/expenses/expense-claim-editor";
import { ExpenseApprovalProgress } from "@/components/expenses/expense-approval-progress";
import { ExpenseRejectBanner } from "@/components/expenses/expense-reject-banner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

function tripDays(trips: Array<{ startDate: Date; endDate: Date }>) {
  if (trips.length === 0) return 0;
  let total = 0;
  for (const t of trips) {
    const ms = t.endDate.getTime() - t.startDate.getTime();
    total += Math.max(1, Math.floor(ms / 86400000) + 1);
  }
  return total;
}

export default async function ExpenseClaimDetailPage({ params }: Props) {
  if (!isExpenseFeatureEnabled()) {
    redirect("/today-work");
  }
  const { id } = await params;
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  const claim = await prisma.expenseClaim.findUnique({
    where: { id },
    include: claimInclude,
  });
  if (!claim || !(await canViewClaim(claim, session.user))) notFound();

  const isApplicant = claim.applicantId === session.user.id;
  const currentStep = getClaimCurrentStep(claim);
  const stepIndex = getClaimCurrentStepIndex(claim);
  const canAct =
    Boolean(currentStep) &&
    userCanActOnFlowStep({
      step: currentStep!,
      user: session.user,
      managerId: claim.managerId,
      isFirstActiveStep: stepIndex === 0,
    });
  const flowMode = editorModeForFlowStep(currentStep, Math.max(0, stepIndex));

  let mode: "edit" | "manager" | "hr" | "finance" | "view" = "view";
  if (isApplicant && (claim.status === "DRAFT" || claim.status === "REJECTED")) {
    mode = "edit";
  } else if (canAct && flowMode) {
    mode = flowMode;
  }

  const [
    { managers, beneficiaries, projects, customers, capability },
    hotelPolicy,
    cityHotelHints,
    feeCategories,
  ] = await Promise.all([
    loadExpenseEditorOptions(session.user.role, session.user.id, {
      id: claim.beneficiary.id,
      role: claim.beneficiary.role,
    }),
    getEffectiveExpenseTravelPolicy(),
    listCityHotelHints(),
    listExpenseFeeCategories(),
  ]);

  const chip = expenseClaimChipStatus(claim.status);
  const places = formatExpensePlaces(claim.trips);
  const timeRange = formatExpenseTimeRange(claim.trips);
  const days = tripDays(claim.trips);
  const attachmentCount = claim.invoices.length;
  const rejectInfo = latestExpenseRejectInfo(claim);
  const progressNodes = buildExpenseApprovalProgressNodes(claim);
  const kindLabel =
    EXPENSE_CLAIM_KIND_LABELS[claim.claimKind] ?? claim.claimKind;
  const showProgress =
    claim.status !== "DRAFT" || progressNodes.some((n) => n.state !== "upcoming");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/expenses" className="hover:underline">
            返回上一级
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">
                {kindLabel}
                {places ? ` - ${places}` : claim.title ? ` - ${claim.title}` : ""}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  chip.chip === "draft" && "bg-muted text-muted-foreground",
                  chip.chip === "pending" &&
                    "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
                  chip.chip === "approved" &&
                    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
                  chip.chip === "rejected" && "bg-destructive/15 text-destructive"
                )}
              >
                {chip.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {timeRange ? `${timeRange} · ` : ""}
              {days > 0 ? `共 ${days} 天 · ` : ""}
              单号 {claim.id.slice(-12).toUpperCase()}
            </p>
            <p className="text-sm text-muted-foreground">
              填单日期 {format(claim.createdAt, "yyyy-MM-dd")} · 填单人{" "}
              {claim.applicant.name}
              {claim.beneficiaryId !== claim.applicantId
                ? ` · 报销人 ${claim.beneficiary.name}`
                : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">报销合计</p>
            <p className="text-2xl font-semibold tabular-nums">
              ¥{Number(claim.totalAmount).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {claim.status === "REJECTED" && rejectInfo.reason ? (
        <ExpenseRejectBanner
          reason={rejectInfo.reason}
          actorName={rejectInfo.actorName}
          at={rejectInfo.at}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryStat label="填单日期" value={format(claim.createdAt, "yyyy-MM-dd")} />
            <SummaryStat label="填单人" value={claim.applicant.name} />
            <SummaryStat
              label="出差天数"
              value={days > 0 ? `${days} 天` : "—"}
            />
            <SummaryStat
              label="费用合计"
              value={`¥${Number(claim.totalAmount).toFixed(2)}`}
            />
            <SummaryStat label="附件张数" value={`${attachmentCount} 张`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {mode === "edit"
                  ? "编辑报销单"
                  : mode === "manager" || mode === "hr" || mode === "finance"
                    ? `${currentStep?.name ?? "审批"}`
                    : "报销单详情"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExpenseClaimEditor
                mode={mode}
                {...expenseEditorClaimProps(claim)}
                currentStepName={currentStep?.name ?? null}
                initialBeneficiaryId={
                  capability.canProxyBeneficiary
                    ? claim.beneficiaryId
                    : session.user.id
                }
                managers={managers}
                beneficiaries={
                  capability.canProxyBeneficiary
                    ? beneficiaries
                    : [{ id: session.user.id, name: session.user.name }]
                }
                projects={projects}
                customers={customers}
                canProxyBeneficiary={capability.canProxyBeneficiary}
                requiresSuperiorPick={capability.requiresSuperiorPick}
                superiorStepName={capability.superiorStepName}
                hotelPolicy={hotelPolicy}
                cityHotelHints={cityHotelHints}
                feeCategories={feeCategories}
              />
            </CardContent>
          </Card>

          {claim.approvals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">审批记录</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {claim.approvals.map((a) => (
                    <li key={a.id} className="rounded border p-2">
                      {expenseApprovalStepLabel(a.step)} ·{" "}
                      {a.action === "APPROVED" ? "通过" : "驳回"} · {a.actor.name} ·{" "}
                      {format(a.createdAt, "yyyy-MM-dd HH:mm")}
                      {a.comment ? ` · ${a.comment}` : ""}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {claim.payout ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">打款信息</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                ¥{Number(claim.payout.amount).toFixed(2)} ·{" "}
                {format(claim.payout.paidAt, "yyyy-MM-dd")}
                {claim.payout.notes ? ` · ${claim.payout.notes}` : ""}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {showProgress ? (
          <ExpenseApprovalProgress
            nodes={progressNodes}
            className="h-fit lg:sticky lg:top-4"
          />
        ) : null}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
