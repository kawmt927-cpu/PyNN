"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TargetMetricsDashboard } from "@/components/plans-tasks/target-metrics-dashboard";
import { MonthlyKpiDashboard } from "@/components/plans-tasks/monthly-kpi-dashboard";
import { AnnualTargetSettingsDialog } from "@/components/plans-tasks/annual-target-settings-dialog";
import { MonthlyKpiTargetSettingsDialog } from "@/components/plans-tasks/monthly-kpi-target-settings-dialog";
import {
  AnnualSubjectSelect,
  MetricsPeriodSwitch,
  MetricsTimeSelect,
  PersonSelect,
  useMetricsNavigation,
} from "@/components/plans-tasks/metrics-period-switch";
import type { AnnualSubject, MetricsPeriod } from "@/lib/plans-tasks/metrics-scope";
import type { SalesMetrics, TargetMetricsBundle } from "@/lib/plans-tasks/metrics";
import type { MonthlyKpiBundle, MonthlyKpiTargets } from "@/lib/plans-tasks/monthly-kpi";

type SalesUser = { id: string; name: string };

export function ManagerMetricsOverview({
  period,
  year,
  month,
  teamSize,
  annualSubject,
  subjectName,
  monthlyUserId,
  monthlyUserName,
  teamMetrics,
  personMetrics,
  personTargetsByUserId,
  monthlyKpi,
  monthlyTargetsByUserId,
  salesUsers,
  nowYear,
  nowMonth,
}: {
  period: MetricsPeriod;
  year: number;
  month: number;
  teamSize: number;
  annualSubject: AnnualSubject;
  subjectName: string;
  monthlyUserId: string;
  monthlyUserName: string;
  teamMetrics: TargetMetricsBundle;
  personMetrics: TargetMetricsBundle;
  personTargetsByUserId: Record<string, SalesMetrics | null>;
  monthlyKpi: MonthlyKpiBundle;
  monthlyTargetsByUserId: Record<string, MonthlyKpiTargets | null>;
  salesUsers: SalesUser[];
  nowYear: number;
  nowMonth: number;
}) {
  const { navigateAnnualSubject, navigateMonthlyUser } = useMetricsNavigation();

  const displayMetrics = annualSubject === "team" ? teamMetrics : personMetrics;
  const defaultPersonUserId =
    annualSubject === "team" ? salesUsers[0]?.id ?? "" : annualSubject;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">指标概览</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            月度按个人查看 KPI 实际值；年度查看团队或个人的考核完成度。项目开发达标规则在系统配置中统一维护。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetricsPeriodSwitch period={period} />
          <MetricsTimeSelect
            period={period}
            year={year}
            month={month}
            nowYear={nowYear}
            nowMonth={nowMonth}
          />
        </div>
      </div>

      {period === "monthly" ? (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {year} 年 {month} 月 KPI · {monthlyUserName}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  月度指标不按团队汇总；每位销售单独设定 KPI 目标
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <PersonSelect
                  id="monthly-person"
                  label="查看销售"
                  value={monthlyUserId}
                  salesUsers={salesUsers}
                  onChange={navigateMonthlyUser}
                />
                <MonthlyKpiTargetSettingsDialog
                  year={year}
                  month={month}
                  defaultUserId={monthlyUserId}
                  salesUsers={salesUsers}
                  targetsByUserId={monthlyTargetsByUserId}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MonthlyKpiDashboard kpi={monthlyKpi} subjectName={monthlyUserName} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {year} 年度指标 · {subjectName}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {annualSubject === "team"
                    ? `共 ${teamSize} 人（含销售与销售管理）· 目标与实值为各人累加`
                    : "个人考核目标与实际完成度"}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <AnnualSubjectSelect
                  value={annualSubject}
                  salesUsers={salesUsers}
                  onChange={navigateAnnualSubject}
                />
                <AnnualTargetSettingsDialog
                  year={year}
                  defaultPersonUserId={defaultPersonUserId}
                  salesUsers={salesUsers}
                  personTargetsByUserId={personTargetsByUserId}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TargetMetricsDashboard
              metrics={displayMetrics}
              subjectName={subjectName}
              variant="embedded"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
