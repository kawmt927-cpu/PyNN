import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  ALL_AUTHED_ROLES,
  EXPENSE_CLAIM_KIND_LABELS,
  formatExpenseClaimListStatus,
} from "@/lib/expenses/labels";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { canAccessSalesMobile } from "@/lib/mobile/sales-roles";
import { CreateExpenseClaimButton } from "@/components/expenses/create-expense-claim-button";
import { ExpenseClaimCards } from "@/components/expenses/expense-claim-list";
import {
  getClaimCurrentStep,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";
import { hasPermission } from "@/lib/rbac/has-permission";

export default async function MobileExpensesPage() {
  if (!isExpenseFeatureEnabled()) {
    redirect("/mobile");
  }
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  if (!(await hasPermission(session.user.role, "expense.access"))) {
    redirect(canAccessSalesMobile(session.user.role) ? "/mobile/more" : "/");
  }
  const userId = session.user.id;
  const backHref = canAccessSalesMobile(session.user.role) ? "/mobile/more" : "/";

  const [mine, toApprove, pendingHrAll, pendingPayAll, projects] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: {
        OR: [{ applicantId: userId }, { beneficiaryId: userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      include: {
        manager: { select: { name: true } },
        applicant: { select: { name: true } },
        beneficiary: { select: { name: true } },
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
      include: {
        applicant: { select: { name: true } },
        manager: { select: { name: true } },
      },
    }),
    prisma.expenseClaim.findMany({
      where: { status: "PENDING_PAYOUT" },
      orderBy: { submittedAt: "asc" },
      take: 80,
      include: {
        applicant: { select: { name: true } },
        manager: { select: { name: true } },
      },
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-8 pt-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
            返回
          </Link>
          <h1 className="mt-1 text-xl font-semibold">报销</h1>
        </div>
        <CreateExpenseClaimButton
          hrefPrefix="/mobile/expenses"
          projects={projects}
        />
      </div>

      {toApprove.length > 0 ? (
        <section className="mb-5 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            待我审批（{toApprove.length}）
          </h2>
          <ExpenseClaimCards
            hrefPrefix="/mobile/expenses"
            rows={toApprove.map((c) => ({
              id: c.id,
              title: c.title,
              amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
              statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
              at: c.submittedAt,
            }))}
          />
        </section>
      ) : null}

      {toHr.length > 0 ? (
        <section className="mb-5 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            待我确认（{toHr.length}）
          </h2>
          <ExpenseClaimCards
            hrefPrefix="/mobile/expenses"
            rows={toHr.map((c) => ({
              id: c.id,
              title: c.title,
              amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
              statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
              at: c.submittedAt,
            }))}
          />
        </section>
      ) : null}

      {toPay.length > 0 ? (
        <section className="mb-5 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            待我打款（{toPay.length}）
          </h2>
          <ExpenseClaimCards
            hrefPrefix="/mobile/expenses"
            rows={toPay.map((c) => ({
              id: c.id,
              title: c.title,
              amountLabel: `¥${Number(c.totalAmount).toFixed(2)}`,
              statusLabel: formatExpenseClaimListStatus(c.status, c.manager?.name),
              at: c.submittedAt,
            }))}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          我的报销（{mineRows.length}）
        </h2>
        {mineRows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            暂无报销单
          </p>
        ) : (
          <ExpenseClaimCards hrefPrefix="/mobile/expenses" rows={mineRows} />
        )}
      </section>
      </div>
    </div>
  );
}
