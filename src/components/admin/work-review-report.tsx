import Link from "next/link";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { SalesWorkReview } from "@/lib/admin/work-review";
import { MonthlyKpiDashboard } from "@/components/plans-tasks/monthly-kpi-dashboard";
import { formatKpiCount } from "@/lib/plans-tasks/monthly-kpi";

function fmtDateTime(iso: string): string {
  return format(new Date(iso), "MM-dd HH:mm");
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DetailFold({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>
            {title}
            <span className="ml-2 font-normal text-muted-foreground">({count})</span>
          </span>
          <span className="text-xs text-muted-foreground">展开 / 收起</span>
        </span>
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}

export function WorkReviewReport({
  report,
  allowProjectDevSettlement,
}: {
  report: SalesWorkReview;
  allowProjectDevSettlement: boolean;
}) {
  const { activity, coverage, opportunities, compliance, monthlyKpi, user, range } = report;
  const processTotal =
    compliance.process.onTimeCount + compliance.process.lateCount + compliance.process.missedCount;

  const summaryBits = [
    `打卡 ${activity.checkInCount} 次（${activity.checkInCustomerCount} 家）`,
    `往来 ${activity.followUpCount} 次（${activity.followUpCustomerCount} 家）`,
    `活跃 ${activity.activeDayCount} 天`,
    compliance.process.missedCount > 0
      ? `漏交日报 ${compliance.process.missedCount} 次`
      : null,
    coverage.silentOverdue.length > 0
      ? `等级逾期待跟进 ${coverage.silentOverdue.length} 家`
      : null,
    compliance.weeklyOverduePendingCount > 0
      ? `逾期待办 ${compliance.weeklyOverduePendingCount} 条`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {user.name} · {range.fromParam} ～ {range.toParam}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              系统根据打卡、往来、日报与商机自动汇总 · 生成于{" "}
              {format(new Date(report.generatedAt), "yyyy-MM-dd HH:mm", { locale: zhCN })}
            </p>
          </div>
          {range.naturalMonth ? (
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {range.naturalMonth.year}年{range.naturalMonth.month}月 · 含月度 KPI 对照
              {range.toParam !==
              format(
                new Date(range.naturalMonth.year, range.naturalMonth.month, 0),
                "yyyy-MM-dd"
              )
                ? "（月初至今）"
                : ""}
            </span>
          ) : (
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              自定义区间 · 仅展示实际数（不含月目标）
            </span>
          )}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
          {summaryBits.map((bit) => (
            <li key={bit} className="before:mr-1 before:text-muted-foreground before:content-['·'] first:before:content-none">
              {bit}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">工作量</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="打卡拜访"
            value={formatKpiCount(activity.checkInCount)}
            hint={`覆盖 ${activity.checkInCustomerCount} 家客户`}
          />
          <StatCard
            label="往来记录"
            value={formatKpiCount(activity.followUpCount)}
            hint={`覆盖 ${activity.followUpCustomerCount} 家客户`}
          />
          <StatCard label="有活动天数" value={formatKpiCount(activity.activeDayCount)} />
          <StatCard
            label="往来方式"
            value={
              activity.methodBreakdown.length > 0
                ? activity.methodBreakdown.map((m) => `${m.label}${m.count}`).join(" / ")
                : "—"
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">客户覆盖</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">区间内有往来的客户（按等级）</p>
            {coverage.byGrade.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">本区间无往来客户</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {coverage.byGrade.map((row) => (
                  <li key={row.grade} className="flex items-center justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="tabular-nums font-medium">{row.customerCount} 家</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              等级逾期待跟进（当前仍逾期，最多 {coverage.silentOverdue.length} 家）
            </p>
            {coverage.silentOverdue.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">暂无等级逾期待跟进</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {coverage.silentOverdue.map((item) => (
                  <li key={item.customerId} className="text-sm">
                    <Link href={`/customers/${item.customerId}`} className="font-medium hover:underline">
                      {item.customerName}
                    </Link>
                    <span className="ml-2 text-muted-foreground">
                      {item.gradeLabel} · 应跟进 {fmtDate(item.dueAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">商机变动</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="新建商机" value={formatKpiCount(opportunities.createdCount)} />
          <StatCard label="阶段推进" value={formatKpiCount(opportunities.stageAdvanceCount)} />
          <StatCard label="签约（状态变更）" value={formatKpiCount(opportunities.signedCount)} />
          <StatCard label="放弃（状态变更）" value={formatKpiCount(opportunities.abandonedCount)} />
        </div>
        {opportunities.created.length > 0 ? (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">新建商机</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {opportunities.created.map((o) => (
                <li key={o.id}>
                  <Link href={`/opportunities/${o.id}`} className="hover:underline">
                    {o.title}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {o.customerName} · {o.stageLabel} · {fmtDate(o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {opportunities.stageAdvances.length > 0 ? (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">阶段推进</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {opportunities.stageAdvances.map((item) => (
                <li key={item.id}>
                  <Link href={`/opportunities/${item.opportunityId}`} className="hover:underline">
                    {item.opportunityTitle}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {item.fromStageLabel} → {item.toStageLabel} · {fmtDate(item.createdAt)}
                    {item.countedAsProjectDev === true ? " · 已计项目开发" : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {opportunities.createdCount === 0 && opportunities.stageAdvanceCount === 0 ? (
          <p className="text-sm text-muted-foreground">本区间无商机新建或阶段推进</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">过程合规</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="日报按时"
            value={formatKpiCount(compliance.process.onTimeCount)}
            hint={processTotal > 0 ? `考核日合计 ${processTotal}` : undefined}
          />
          <StatCard label="日报迟交" value={formatKpiCount(compliance.process.lateCount)} />
          <StatCard label="日报漏交" value={formatKpiCount(compliance.process.missedCount)} />
          <StatCard
            label="含风险日报"
            value={formatKpiCount(compliance.riskReportCount)}
            hint={`周任务完成 ${compliance.weeklyCompletedCount} · 当前逾期 ${compliance.weeklyOverduePendingCount}`}
          />
        </div>
      </section>

      {monthlyKpi ? (
        <section className="space-y-3">
          <h3 className="text-base font-semibold">月度 KPI（自然月）</h3>
          <MonthlyKpiDashboard
            kpi={monthlyKpi}
            subjectName={user.name}
            subjectUserId={user.id}
            allowProjectDevSettlement={allowProjectDevSettlement}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">明细</h3>
        <DetailFold title="打卡拜访明细" count={report.checkInDetails.length}>
          {report.checkInDetails.length === 0 ? (
            <p className="text-sm text-muted-foreground">无记录</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.checkInDetails.map((row) => (
                <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="tabular-nums text-muted-foreground">{fmtDateTime(row.at)}</span>
                  <span className="font-medium">{row.customerName}</span>
                  <span className="text-muted-foreground">{row.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailFold>
        <DetailFold title="往来明细" count={report.followUpDetails.length}>
          {report.followUpDetails.length === 0 ? (
            <p className="text-sm text-muted-foreground">无记录</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.followUpDetails.map((row) => (
                <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="tabular-nums text-muted-foreground">{fmtDateTime(row.at)}</span>
                  <span className="font-medium">{row.customerName}</span>
                  <span className="text-muted-foreground">{row.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailFold>
      </section>
    </div>
  );
}
