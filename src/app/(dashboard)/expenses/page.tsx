import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_AUTHED_ROLES,
  EXPENSE_MINE_CHIPS,
  expenseStatusesForMineChip,
  parseExpenseMineChip,
  type ExpenseMineChip,
} from "@/lib/expenses/labels";
import { CreateExpenseClaimButton } from "@/components/expenses/create-expense-claim-button";
import { ExpenseClaimTable } from "@/components/expenses/expense-claim-list";
import { ExpenseMineStatusFilter } from "@/components/expenses/expense-mine-status-filter";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { toExpenseMineListRow, formatExpensePlaces } from "@/lib/expenses/list-rows";
import { hasPermission } from "@/lib/rbac/has-permission";

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function ExpensesPage({ searchParams }: Props) {
  if (!isExpenseFeatureEnabled()) {
    redirect("/today-work");
  }
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  if (!(await hasPermission(session.user.role, "expense.access"))) {
    redirect("/today-work");
  }
  const userId = session.user.id;
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
  const filteredCount =
    activeChip === "all" ? counts.all : counts[activeChip];

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            我的报销（{counts.all}）
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            待办请在「通知与审批」处理。审批流程可在系统配置中调整。
          </p>
        </div>
        <CreateExpenseClaimButton
          projects={projects}
          recentReuse={recentReuse}
        />
      </div>

      <ExpenseMineStatusFilter counts={counts} active={activeChip} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-muted-foreground">
            {EXPENSE_MINE_CHIPS.find((c) => c.key === activeChip)?.label ??
              "全部"}
            （{filteredCount}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mineRows.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {activeChip === "all"
                  ? "该分组下暂无报销记录"
                  : "该分组下暂无报销记录"}
              </p>
              <div className="mt-4 flex justify-center">
                <CreateExpenseClaimButton
                  projects={projects}
                  recentReuse={recentReuse}
                  label="新建一笔报销"
                  variant="outline"
                />
              </div>
            </div>
          ) : (
            <ExpenseClaimTable rows={mineRows} />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        系统会在每天 09:00 推送待处理提醒；草稿自动保存最近 30 天，过期后自动清理。
      </p>
    </div>
  );
}
