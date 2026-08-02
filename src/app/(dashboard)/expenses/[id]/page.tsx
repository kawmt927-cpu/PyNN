import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_AUTHED_ROLES,
  EXPENSE_CLAIM_STATUS_LABELS,
  canFinanceExpense,
} from "@/lib/expenses/labels";
import { claimInclude, canViewClaim } from "@/lib/expenses/service";
import {
  getEffectiveExpenseTravelPolicy,
  listCityHotelHints,
} from "@/lib/expenses/travel-policy";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
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
  if (!claim || !canViewClaim(claim, session.user)) notFound();

  const isApplicant = claim.applicantId === session.user.id;
  const isManager =
    claim.managerId === session.user.id || session.user.role === "ADMIN";
  const isFinance = canFinanceExpense(session.user.role);

  let mode: "edit" | "manager" | "finance" | "view" = "view";
  if (
    isApplicant &&
    (claim.status === "DRAFT" || claim.status === "REJECTED")
  ) {
    mode = "edit";
  } else if (isManager && claim.status === "PENDING_MANAGER") {
    mode = "manager";
  } else if (isFinance && claim.status === "PENDING_PAYOUT") {
    mode = "finance";
  }

  const [managers, projects, customers, hotelPolicy, cityHotelHints] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { not: claim.applicantId },
        OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    getEffectiveExpenseTravelPolicy(),
    listCityHotelHints(),
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
            {claim.applicant.name} ·{" "}
            {EXPENSE_CLAIM_STATUS_LABELS[claim.status] ?? claim.status} · 合计 ¥
            {Number(claim.totalAmount).toFixed(2)}
            {claim.manager ? ` · 上级 ${claim.manager.name}` : ""}
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
                ? "上级审批（请确认每张发票归属）"
                : mode === "finance"
                  ? "财务打款结案"
                  : "报销单详情"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseClaimEditor
            claimId={claim.id}
            mode={mode}
            initialTitle={claim.title}
            initialDescription={claim.description}
            invoices={claim.invoices}
            trips={claim.trips}
            managers={managers}
            projects={projects}
            customers={customers}
            currentManagerId={claim.managerId}
            hotelPolicy={hotelPolicy}
            cityHotelHints={cityHotelHints}
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
                  {a.step === "MANAGER" ? "上级" : "财务"} · {a.action === "APPROVED" ? "通过" : "驳回"} ·{" "}
                  {a.actor.name} · {format(a.createdAt, "yyyy-MM-dd HH:mm")}
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
