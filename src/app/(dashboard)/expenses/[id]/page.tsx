import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_AUTHED_ROLES,
  EXPENSE_CLAIM_STATUS_LABELS,
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
import { ExpenseClaimEditor } from "@/components/expenses/expense-claim-editor";
import { format } from "date-fns";

type Props = { params: Promise<{ id: string }> };

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/expenses" className="hover:underline">
              报销
            </Link>
            {" / "}
            详情
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{claim.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            填报 {claim.applicant.name}
            {claim.beneficiaryId !== claim.applicantId
              ? ` · 报销人 ${claim.beneficiary.name}`
              : ""}{" "}
            · {EXPENSE_CLAIM_STATUS_LABELS[claim.status] ?? claim.status} · 合计 ¥
            {Number(claim.totalAmount).toFixed(2)}
            {claim.manager ? ` · 上级 ${claim.manager.name}` : ""}
            {claim.project ? ` · 项目 ${claim.project.name}` : ""}
          </p>
          {claim.rejectReason ? (
            <p className="mt-2 text-sm text-destructive">驳回原因：{claim.rejectReason}</p>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {mode === "edit"
              ? "编辑报销单"
              : mode === "manager"
                ? `${currentStep?.name ?? "上级审批"}（请填写每张发票成本归属）`
                : mode === "hr"
                  ? currentStep?.name ?? "审批确认"
                : mode === "finance"
                  ? currentStep?.name ?? "打款结案"
                  : "报销单详情"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseClaimEditor
            mode={mode}
            {...expenseEditorClaimProps(claim)}
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
  );
}
