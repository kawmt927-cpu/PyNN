import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_AUTHED_ROLES, EXPENSE_CLAIM_STATUS_LABELS, canFinanceExpense } from "@/lib/expenses/labels";
import { CreateExpenseClaimButton } from "@/components/expenses/create-expense-claim-button";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { format } from "date-fns";

export default async function ExpensesPage() {
  if (!isExpenseFeatureEnabled()) {
    redirect("/today-work");
  }
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  const userId = session.user.id;
  const finance = canFinanceExpense(session.user.role);

  const [mine, toApprove, toPay] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { applicantId: userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { manager: { select: { name: true } } },
    }),
    prisma.expenseClaim.findMany({
      where: { managerId: userId, status: "PENDING_MANAGER" },
      orderBy: { submittedAt: "asc" },
      take: 50,
      include: { applicant: { select: { name: true } } },
    }),
    finance
      ? prisma.expenseClaim.findMany({
          where: { status: "PENDING_PAYOUT" },
          orderBy: { submittedAt: "asc" },
          take: 50,
          include: { applicant: { select: { name: true } }, manager: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">报销</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传电子发票 AI 识别，上级按发票指定销售/项目成本归属，财务打款结案。
          </p>
        </div>
        <CreateExpenseClaimButton />
      </div>

      {toApprove.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>待我审批（{toApprove.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimTable
              rows={toApprove.map((c) => ({
                id: c.id,
                title: c.title,
                meta: `${c.applicant.name} · ¥${Number(c.totalAmount).toFixed(2)}`,
                status: c.status,
                at: c.submittedAt,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {finance && toPay.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>待打款（{toPay.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimTable
              rows={toPay.map((c) => ({
                id: c.id,
                title: c.title,
                meta: `${c.applicant.name} · 上级 ${c.manager?.name ?? "—"} · ¥${Number(c.totalAmount).toFixed(2)}`,
                status: c.status,
                at: c.submittedAt,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>我的报销</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无报销单，点击「新建报销」开始。</p>
          ) : (
            <ClaimTable
              rows={mine.map((c) => ({
                id: c.id,
                title: c.title,
                meta: `审批人 ${c.manager?.name ?? "—"} · ¥${Number(c.totalAmount).toFixed(2)}`,
                status: c.status,
                at: c.updatedAt,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClaimTable({
  rows,
}: {
  rows: Array<{ id: string; title: string; meta: string; status: string; at: Date | null }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">标题</th>
            <th className="pb-2 pr-4">信息</th>
            <th className="pb-2 pr-4">状态</th>
            <th className="pb-2 pr-4">时间</th>
            <th className="pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-3 pr-4 font-medium">{row.title}</td>
              <td className="py-3 pr-4 text-muted-foreground">{row.meta}</td>
              <td className="py-3 pr-4">
                {EXPENSE_CLAIM_STATUS_LABELS[row.status] ?? row.status}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap">
                {row.at ? format(row.at, "yyyy-MM-dd HH:mm") : "—"}
              </td>
              <td className="py-3">
                <Link href={`/expenses/${row.id}`} className="text-primary hover:underline">
                  打开
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
