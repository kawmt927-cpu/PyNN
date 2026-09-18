import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { getAdminOpsDashboard, opsRecentYears } from "@/lib/admin/ops-dashboard";
import { formatAmount } from "@/lib/opportunities/funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OpsPeriodToolbar } from "@/components/admin/ops-period-toolbar";
import { OpsMetricCards } from "@/components/admin/ops-metric-cards";
import { OpsProjectsStatusBar } from "@/components/admin/ops-projects-status-bar";
import { OpsOutstandingProgress } from "@/components/admin/ops-outstanding-progress";
import { OpsFocusOpportunities } from "@/components/admin/ops-focus-opportunities";
import { withReturnTo } from "@/lib/navigation/return-to";
import { parseOpsArParam } from "@/lib/admin/ops-ar-param";

type Props = {
  searchParams: Promise<{
    year?: string;
    preset?: string;
    from?: string;
    to?: string;
    net?: string;
    ar?: string;
  }>;
};

function buildOpsReturnPath(
  period: {
    preset: string;
    year: number | null;
    fromMonth: string;
    toMonth: string;
  },
  net: boolean
) {
  const params = new URLSearchParams();
  if (period.preset === "custom") {
    params.set("from", period.fromMonth);
    params.set("to", period.toMonth);
  } else if (period.year) {
    params.set("year", String(period.year));
  }
  if (net) params.set("net", "1");
  const qs = params.toString();
  return qs ? `/admin/ops?${qs}` : "/admin/ops";
}

export default async function AdminOpsPage({ searchParams }: Props) {
  const session = await requireRole(["ADMIN", "SALES_MANAGER"]);
  const isAdmin = session.user.role === "ADMIN";
  const params = await searchParams;
  const years = opsRecentYears();
  const net = params.net === "1" || params.net === "true";
  const initialAr = parseOpsArParam(params.ar);

  const data = await getAdminOpsDashboard(session.user.id, {
    year: params.year,
    preset: params.preset,
    from: params.from,
    to: params.to,
    net,
  });
  const { period } = data;
  const returnTo = buildOpsReturnPath(period, data.net);
  const netHint = data.net ? "（净得）" : "";

  const metricCards = [
    {
      key: "signed" as const,
      label: `${period.label} 签约合同额${netHint}`,
      value: formatAmount(data.contracts.signedAmount),
      hint: data.net
        ? `${data.contracts.signedCount} 份 · 已扣外部成本（内部实施不扣）`
        : `${data.contracts.signedCount} 份已签合同`,
    },
    {
      key: "collected" as const,
      label: `${period.label} 已回款${netHint}`,
      value: formatAmount(data.contracts.collectedAmount),
      hint: data.net
        ? "按回款日 · 含保证金收回 · 按净额比例折算（保证金不折算）"
        : "按实际回款日 · 含保证金收回",
    },
    ...(isAdmin
      ? [
          {
            key: "costs" as const,
            label: `${period.label} 总成本`,
            value: formatAmount(data.costs.totalAmount),
            hint: "外部项目 · 人力 · 其他 · 保证金",
          },
        ]
      : []),
    {
      key: "maintenance" as const,
      label: `${period.label} 维保总额`,
      value: formatAmount(data.maintenance.totalAmount),
      hint: `${data.maintenance.count} 份未结清维保（年额全计，续期取最新）`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">运营看板</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "公司整体签约、回款、维保与近期重点跟进一览。"
              : "销售侧签约、回款、维保与近期重点跟进一览（不含总成本与报销）。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/projects/portfolio">组合看板</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/cost-ledger">成本台账</Link>
          </Button>
        </div>
      </div>

      <OpsPeriodToolbar
        preset={period.preset}
        selectedYear={period.year}
        years={years}
        fromMonth={period.fromMonth}
        toMonth={period.toMonth}
        label={period.label}
        net={data.net}
      />

      <OpsMetricCards
        periodLabel={period.label}
        cards={metricCards}
        returnTo={returnTo}
        contracts={data.contracts.rows.map((r) => ({
          ...r,
          signedAt: r.signedAt?.toISOString() ?? null,
        }))}
        payments={data.contracts.paymentRows.map((r) => ({
          ...r,
          paidAt: r.paidAt.toISOString(),
        }))}
        maintenance={data.maintenance.rows.map((r) => ({
          ...r,
          maintenanceStartAt: r.maintenanceStartAt.toISOString(),
          maintenanceEndAt: r.maintenanceEndAt.toISOString(),
        }))}
        costs={data.costs}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            待回款{data.net ? "（净得）" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OpsOutstandingProgress
            data={data.contracts.outstandingAr}
            returnTo={returnTo}
            showTotal
            net={data.net}
            initialOpen={initialAr}
          />
        </CardContent>
      </Card>

      <OpsProjectsStatusBar
        activeCount={data.projects.activeCount}
        contractAmount={data.projects.contractAmount}
        byStatus={data.projects.byStatus}
        returnTo={returnTo}
      />

      {isAdmin && data.expenses ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">报销概况</CardTitle>
          </CardHeader>
          <CardContent>
            {data.expenses.enabled ? (
              <div className="flex flex-wrap gap-6 text-sm">
                <p>
                  待上级审批{" "}
                  <span className="font-semibold tabular-nums">{data.expenses.pendingManager}</span>
                </p>
                <p>
                  待行政确认{" "}
                  <span className="font-semibold tabular-nums">{data.expenses.pendingHr}</span>
                </p>
                <p>
                  待管理员打款{" "}
                  <span className="font-semibold tabular-nums">{data.expenses.pendingPayout}</span>
                </p>
                <p>
                  本月已打款{" "}
                  <span className="font-semibold tabular-nums">
                    {formatAmount(data.expenses.paidThisMonthAmount)}
                  </span>
                </p>
                <Link
                  href={withReturnTo("/expenses", returnTo)}
                  className="text-primary hover:underline"
                >
                  打开报销
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                报销模块未开启。可在{" "}
                <Link
                  href={withReturnTo("/admin/settings?tab=features", returnTo)}
                  className="text-primary hover:underline"
                >
                  系统配置 → 功能开关
                </Link>{" "}
                中打开。
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              重点商机
              {data.opportunityFocusCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  共 {data.opportunityFocusCount} 条
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OpsFocusOpportunities rows={data.opportunities} returnTo={returnTo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">本周待办 / 逾期</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">本周暂无待办。</p>
            ) : (
              <ul className="divide-y">
                {data.upcoming.map((row) => (
                  <li key={`${row.kind}-${row.id}`} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={withReturnTo(row.href, returnTo)}
                      className="block hover:opacity-90"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.title}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{row.subtitle}</p>
                        </div>
                        <p
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            row.overdue ? "font-medium text-destructive" : "text-muted-foreground"
                          )}
                        >
                          {format(row.dueAt, "MM-dd")}
                          {row.overdue ? " 逾期" : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={withReturnTo("/plans-tasks", returnTo)}
              className="mt-3 inline-block text-xs text-primary hover:underline"
            >
              打开计划与任务
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
