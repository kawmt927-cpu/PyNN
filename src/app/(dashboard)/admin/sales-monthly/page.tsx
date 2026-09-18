import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildSalesMonthlySnapshot } from "@/lib/sales/monthly-report";
import { confirmSalesMonthlyReport } from "@/app/(dashboard)/admin/sales-monthly/actions";
import { formatAmount } from "@/lib/opportunities/funnel";

type Props = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

function resolveYearMonth(params: { year?: string; month?: string }) {
  const now = new Date();
  const year = Number.parseInt(params.year ?? "", 10);
  const month = Number.parseInt(params.month ?? "", 10);
  return {
    year: Number.isFinite(year) && year >= 2000 ? year : now.getFullYear(),
    month:
      Number.isFinite(month) && month >= 1 && month <= 12
        ? month
        : now.getMonth() + 1,
  };
}

export default async function SalesMonthlyReportPage({ searchParams }: Props) {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const query = await searchParams;
  const { year, month } = resolveYearMonth(query);

  const [archived, snapshot] = await Promise.all([
    prisma.salesMonthlyReport.findUnique({
      where: { year_month: { year, month } },
      include: { confirmedBy: { select: { name: true } } },
    }),
    buildSalesMonthlySnapshot(year, month),
  ]);

  const prev =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/stats" className="hover:underline">
            统计管理
          </Link>
          <span className="mx-1.5">/</span>
          销售月报
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          销售月报 · {year}年{month}月
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          自动汇总跟进、打卡、日报提交率、签约/回款与销售成本；确认后归档快照。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/sales-monthly?year=${prev.year}&month=${prev.month}`}>
            上月
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/sales-monthly?year=${next.year}&month=${next.month}`}>
            下月
          </Link>
        </Button>
        {archived ? (
          <span className="text-sm text-muted-foreground">
            已于 {format(archived.confirmedAt, "yyyy-MM-dd HH:mm")} 由{" "}
            {archived.confirmedBy.name} 归档
          </span>
        ) : (
          <form action={confirmSalesMonthlyReport}>
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <Button type="submit" size="sm">
              确认归档
            </Button>
          </form>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["跟进", String(snapshot.totals.followUpCount)],
            ["打卡", String(snapshot.totals.checkInCount)],
            ["日报提交率", `${snapshot.totals.dailyReportRate}%`],
            ["签约额", formatAmount(snapshot.totals.salesAmount)],
            ["回款", formatAmount(snapshot.totals.paymentAmount)],
            ["销售成本", formatAmount(snapshot.totals.salesCost)],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">按销售下钻</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {snapshot.people.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无参与月度考核的销售</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">销售</th>
                  <th className="py-2 pr-3 font-medium">跟进</th>
                  <th className="py-2 pr-3 font-medium">打卡</th>
                  <th className="py-2 pr-3 font-medium">日报率</th>
                  <th className="py-2 pr-3 font-medium">签约</th>
                  <th className="py-2 pr-3 font-medium">回款</th>
                  <th className="py-2 pr-3 font-medium">成本</th>
                  <th className="py-2 font-medium">KPI(渠/项/回/维)</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.people.map((row) => (
                  <tr key={row.userId} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{row.name}</td>
                    <td className="py-2 pr-3">{row.followUpCount}</td>
                    <td className="py-2 pr-3">{row.checkInCount}</td>
                    <td className="py-2 pr-3">{row.dailyReportRate}%</td>
                    <td className="py-2 pr-3">{formatAmount(row.salesAmount)}</td>
                    <td className="py-2 pr-3">{formatAmount(row.paymentAmount)}</td>
                    <td className="py-2 pr-3">{formatAmount(row.salesCost)}</td>
                    <td className="py-2 text-muted-foreground">
                      {row.kpi.channelDev}/{row.kpi.projectDev}/
                      {formatAmount(row.kpi.paymentCollection)}/{row.kpi.maintenance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
