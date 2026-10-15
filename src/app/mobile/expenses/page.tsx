import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  ALL_AUTHED_ROLES,
  expenseStatusesForMineChip,
  parseExpenseMineChip,
  type ExpenseMineChip,
} from "@/lib/expenses/labels";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { canAccessSalesMobile } from "@/lib/mobile/sales-roles";
import { CreateExpenseClaimButton } from "@/components/expenses/create-expense-claim-button";
import { ExpenseClaimCards } from "@/components/expenses/expense-claim-list";
import { ExpenseMineStatusFilter } from "@/components/expenses/expense-mine-status-filter";
import { toExpenseMineListRow, formatExpensePlaces } from "@/lib/expenses/list-rows";
import { hasPermission } from "@/lib/rbac/has-permission";

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function MobileExpensesPage({ searchParams }: Props) {
  if (!isExpenseFeatureEnabled()) {
    redirect("/mobile");
  }
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  if (!(await hasPermission(session.user.role, "expense.access"))) {
    redirect(canAccessSalesMobile(session.user.role) ? "/mobile/more" : "/");
  }
  const userId = session.user.id;
  const backHref = canAccessSalesMobile(session.user.role) ? "/mobile/more" : "/";
  const { status: statusRaw } = await searchParams;
  const activeChip = parseExpenseMineChip(statusRaw);
  const statusFilter = expenseStatusesForMineChip(activeChip);

  const mineWhere = {
    OR: [{ applicantId: userId }, { beneficiaryId: userId }],
  };

  const [mineAll, mine, projects, recentSource] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: mineWhere,
      select: { status: true },
      take: 500,
    }),
    prisma.expenseClaim.findMany({
      where: {
        ...mineWhere,
        ...(statusFilter ? { status: { in: statusFilter as never } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      include: {
        trips: {
          select: {
            fromCity: true,
            city: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { sortOrder: "asc" },
        },
        items: {
          select: { categoryKey: true, title: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.expenseClaim.findFirst({
      where: {
        OR: [{ applicantId: userId }, { beneficiaryId: userId }],
        status: { in: ["PENDING_MANAGER", "PENDING_HR", "PENDING_PAYOUT", "PAID"] },
      },
      orderBy: { submittedAt: "desc" },
      include: {
        trips: {
          select: { fromCity: true, city: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
  ]);

  const counts: Record<ExpenseMineChip, number> = {
    all: mineAll.length,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of mineAll) {
    if (row.status === "DRAFT") counts.draft += 1;
    else if (row.status === "REJECTED") counts.rejected += 1;
    else if (row.status === "PAID") counts.approved += 1;
    else if (
      row.status === "PENDING_MANAGER" ||
      row.status === "PENDING_HR" ||
      row.status === "PENDING_PAYOUT"
    ) {
      counts.pending += 1;
    }
  }

  const mineRows = mine.map((c) => toExpenseMineListRow(c, userId));
  const recentReuse = recentSource
    ? {
        id: recentSource.id,
        claimKind: recentSource.claimKind as "TRAVEL" | "FEE" | "PROJECT",
        title: recentSource.title,
        submittedAt: recentSource.submittedAt?.toISOString() ?? null,
        placesLabel: formatExpensePlaces(recentSource.trips),
      }
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-8 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
              返回
            </Link>
            <h1 className="mt-1 text-xl font-semibold">我的报销（{counts.all}）</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              待办请在「通知与审批」处理
            </p>
          </div>
          <CreateExpenseClaimButton
            hrefPrefix="/mobile/expenses"
            projects={projects}
            recentReuse={recentReuse}
          />
        </div>

        <ExpenseMineStatusFilter
          counts={counts}
          active={activeChip}
          basePath="/mobile/expenses"
        />

        {mineRows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            该分组下暂无报销记录
          </p>
        ) : (
          <ExpenseClaimCards hrefPrefix="/mobile/expenses" rows={mineRows} />
        )}
      </div>
    </div>
  );
}
