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
  othersMetrics,
  otherTeamUsers = [],
  personTargetsByUserId,
  monthlyKpi,
  monthlyTargetsByUserId,
  salesUsers,
  regularSalesUsers,
  monthlyUsers = salesUsers,
  nowYear,
  nowMonth,
  allowTargetSettings = true,
  recentYearsOnly = false,
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
  /** 「其他」非普通销售合计；无其他人时可与 teamMetrics 相同占位 */
  othersMetrics: TargetMetricsBundle;
  /** 「其他」成员（销售管理/管理员等） */
  otherTeamUsers?: SalesUser[];
  personTargetsByUserId: Record<string, SalesMetrics | null>;
  monthlyKpi: MonthlyKpiBundle;
  monthlyTargetsByUserId: Record<string, MonthlyKpiTargets | null>;
  /** 参与团队业绩全体（设置目标用） */
  salesUsers: SalesUser[];
  /** 普通销售（年度查看对象逐人） */
  regularSalesUsers: SalesUser[];
  /** 参与月度考核对象 */
  monthlyUsers?: SalesUser[];
  nowYear: number;
  nowMonth: number;
  allowTargetSettings?: boolean;
  /** 手机端：年月仅限今年与去年 */
  recentYearsOnly?: boolean;
}) {
  const { navigateAnnualSubject, navigateMonthlyUser } = useMetricsNavigation();

  const displayMetrics =
    annualSubject === "team"
      ? teamMetrics
      : annualSubject === "others"
        ? othersMetrics
        : personMetrics;
  const defaultPersonUserId =
    regularSalesUsers[0]?.id ?? salesUsers[0]?.id ?? "";
  const monthlyPersonList = monthlyUsers.length > 0 ? monthlyUsers : salesUsers;
  const othersNames = otherTeamUsers.map((u) => u.name).filter(Boolean);
  const othersCount = otherTeamUsers.length;

  const annualHint =
    annualSubject === "team"
      ? `团队汇总 · 共 ${teamSize} 人 · 目标与实值为各人累加`
      : annualSubject === "others"
        ? `其他 · 共 ${othersCount} 人（${othersNames.join("、") || "—"}）· 目标与实值为各人累加`
        : `${subjectName} · 普通销售个人考核目标与实际完成度`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">指标概览</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {allowTargetSettings
              ? "月度按个人查看 KPI；年度可看团队汇总、普通销售个人，或「其他」合计。项目开发由销售管理/管理员在卡片上「核算」。"
              : "手机端可查看指标；目标设定请在电脑端完成。项目开发可由销售管理/管理员点「核算」。"}
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
            recentYearsOnly={recentYearsOnly}
          />
        </div>
      </div>

      {period === "monthly" ? (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {year} 年 {month} 月 KPI
                </CardTitle>
                <div className="flex flex-wrap items-center gap-3">
                  {monthlyPersonList.length > 0 ? (
                    <PersonSelect
                      id="monthly-person"
                      value={monthlyUserId}
                      salesUsers={monthlyPersonList}
                      onChange={navigateMonthlyUser}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无参与月度考核的人员</p>
                  )}
                  {allowTargetSettings && monthlyPersonList.length > 0 ? (
                    <MonthlyKpiTargetSettingsDialog
                      year={year}
                      month={month}
                      defaultUserId={monthlyUserId}
                      salesUsers={monthlyPersonList}
                      targetsByUserId={monthlyTargetsByUserId}
                    />
                  ) : null}
                </div>
              </div>
              <p className="min-h-10 text-sm leading-5 text-muted-foreground line-clamp-2">
                {monthlyPersonList.length > 0
                  ? `${monthlyUserName} · 月度指标不按团队汇总；每位销售单独设定 KPI 目标`
                  : "请在「销售人员」中勾选「参与月度考核」后再查看。"}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyPersonList.length > 0 ? (
              <MonthlyKpiDashboard
                kpi={monthlyKpi}
                subjectName={monthlyUserName}
                subjectUserId={monthlyUserId}
                allowProjectDevSettlement
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                请在「销售人员」中勾选「参与月度考核」后再查看。
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">{year} 年度指标</CardTitle>
                <div className="flex flex-wrap items-center gap-3">
                  <AnnualSubjectSelect
                    value={annualSubject}
                    regularSalesUsers={regularSalesUsers}
                    showOthers={othersCount > 0}
                    onChange={navigateAnnualSubject}
                  />
                  {allowTargetSettings ? (
                    <AnnualTargetSettingsDialog
                      year={year}
                      defaultPersonUserId={defaultPersonUserId}
                      salesUsers={salesUsers}
                      personTargetsByUserId={personTargetsByUserId}
                    />
                  ) : null}
                </div>
              </div>
              <p className="min-h-10 text-sm leading-5 text-muted-foreground line-clamp-2">
                {annualHint}
              </p>
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
