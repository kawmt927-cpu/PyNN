import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_AUTHED_ROLES,
  EXPENSE_CLAIM_KIND_LABELS,
  formatExpenseClaimListStatus,
} from "@/lib/expenses/labels";
import { CreateExpenseClaimButton } from "@/components/expenses/create-expense-claim-button";
import { ExpenseClaimTable } from "@/components/expenses/expense-claim-list";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import {
  getClaimCurrentStep,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";
import { hasPermission } from "@/lib/rbac/has-permission";

export default async function ExpensesPage() {
  if (!isExpenseFeatureEnabled()) {
    redirect("/today-work");
  }
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  if (!(await hasPermission(session.user.role, "expense.access"))) {
    redirect("/today-work");
  }
  const userId = session.user.id;

  const [mine, toApprove, pendingHrAll, pendingPayAll, projects] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: {
        OR: [{ applicantId: userId }, { beneficiaryId: userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      include: {
        manager: { select: { name: true } },
        beneficiary: { select: { name: true } },
        applicant: { select: { name: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.expenseClaim.findMany({
      where: { managerId: userId, status: "PENDING_MANAGER" },
      orderBy: { submittedAt: "asc" },
      take: 50,
      include: {
        applicant: { select: { name: true } },
        manager: { select: { name: true } },
      },
    }),
    prisma.expenseClaim.findMany({
      where: { status: "PENDING_HR" },
      orderBy: { submittedAt: "asc" },
      take: 80,
      include: { applicant: { select: { name: true } }, manager: { select: { name: true } } },
    }),
    prisma.expenseClaim.findMany({
      where: { status: "PENDING_PAYOUT" },
      orderBy: { submittedAt: "asc" },
      take: 80,
      include: { applicant: { select: { name: true } }, manager: { select: { name: true } } },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const toHr = pendingHrAll.filter((c) => {
    const step = getClaimCurrentStep(c);
    return (
      step &&
      userCanActOnFlowStep({
        step,
        user: session.user,
        managerId: c.managerId,
      })
    );
  });
  const toPay = pendingPayAll.filter((c) => {
    const step = getClaimCurrentStep(c);
    return (
      step &&
      userCanActOnFlowStep({
        step,
        user: session.user,
        managerId: c.managerId,
      })
    );
  });

  const mineRows = mine.map((c) => ({
    id: c.id,
    kindLabel: EXPENSE_CLAIM_KIND_LABELS[c.claimKind] ?? c.claimKind,
    title: c.title,
    amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
    statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
    at: c.updatedAt,
    canDelete:
      c.applicantId === userId && (c.status === "DRAFT" || c.status === "REJECTED"),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">报销</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            审批流程可在「系统配置 → 报销设置」中调整；提交时锁定流程快照。草稿可删除，指定上级审批时填写成本归属。
          </p>
        </div>
        <CreateExpenseClaimButton projects={projects} />
      </div>

      {toApprove.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>待我审批（{toApprove.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseClaimTable
              rows={toApprove.map((c) => ({
                id: c.id,
                title: c.title,
                amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
                statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
                at: c.submittedAt,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {toHr.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>待我确认（{toHr.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseClaimTable
              rows={toHr.map((c) => ({
                id: c.id,
                title: c.title,
                amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
                statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
                at: c.submittedAt,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {toPay.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>待我打款（{toPay.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseClaimTable
              rows={toPay.map((c) => ({
                id: c.id,
                title: c.title,
                amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
                statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
                at: c.submittedAt,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>我的报销（{mineRows.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {mineRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无报销单，点击右上角新建。</p>
          ) : (
            <ExpenseClaimTable rows={mineRows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
