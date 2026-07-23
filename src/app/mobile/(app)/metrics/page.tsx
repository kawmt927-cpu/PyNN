import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import {
  getTargetMetricsBundle,
  getTeamAnnualMetrics,
  toAnnualMetricsBundle,
} from "@/lib/plans-tasks/metrics";
import { getMonthlyKpiBundle } from "@/lib/plans-tasks/monthly-kpi";
import { TargetMetricsDashboard } from "@/components/plans-tasks/target-metrics-dashboard";
import { MonthlyKpiDashboard } from "@/components/plans-tasks/monthly-kpi-dashboard";
import { ManagerMetricsOverview } from "@/components/plans-tasks/manager-metrics-overview";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import {
  parseAnnualSubject,
  parseMetricsMonth,
  parseMetricsPeriod,
  parseMetricsYearRecent,
  resolveMonthlyUserId,
} from "@/lib/plans-tasks/metrics-scope";
import { SalesMetricsTimeSelect } from "@/components/plans-tasks/metrics-period-switch";
import {
  monthlyAssessmentMemberWhere,
  teamPerformanceMemberWhere,
} from "@/lib/sales/team-performance";

type Props = {
  searchParams: Promise<{
    period?: string;
    subject?: string;
    userId?: string;
    monthlyUserId?: string;
    year?: string;
    month?: string;
  }>;
};

export default async function MobileMetricsPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await requireRole(SALES_MOBILE_ROLES);
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const year = parseMetricsYearRecent(query, now);
  const month = parseMetricsMonth(query, year, now);
  const canManage = canManageWeeklyAssignments(session.user.role);

  const [salesUsers, monthlyUsers] = canManage
    ? await Promise.all([
        prisma.user.findMany({
          where: teamPerformanceMemberWhere(),
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
          where: monthlyAssessmentMemberWhere(),
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], []];

  const regularSalesUsers = salesUsers.filter((u) => u.role === "SALES");
  const otherTeamUsers = salesUsers.filter((u) => u.role !== "SALES");
  const salesUserIds = salesUsers.map((u) => u.id);
  const regularSalesUserIds = regularSalesUsers.map((u) => u.id);
  const otherTeamUserIds = otherTeamUsers.map((u) => u.id);
  const monthlyUserIds = monthlyUsers.map((u) => u.id);
  const period = parseMetricsPeriod(query, canManage);
  const annualSubject = parseAnnualSubject(query, regularSalesUserIds, {
    hasOthers: otherTeamUserIds.length > 0,
  });
  const monthlyUserId = canManage
    ? resolveMonthlyUserId(query, monthlyUserIds, session.user.id)
    : session.user.id;

  const subjectName =
    annualSubject === "team"
      ? "团队汇总"
      : annualSubject === "others"
        ? "其他"
        : regularSalesUsers.find((u) => u.id === annualSubject)?.name ?? session.user.name;
  const monthlyUserName =
    monthlyUsers.find((u) => u.id === monthlyUserId)?.name ?? session.user.name;

  let managerView: {
    period: typeof period;
    teamSize: number;
    annualSubject: typeof annualSubject;
    subjectName: string;
    monthlyUserId: string;
    monthlyUserName: string;
    teamMetrics: Awaited<ReturnType<typeof toAnnualMetricsBundle>>;
    personMetrics: Awaited<ReturnType<typeof getTargetMetricsBundle>>;
    othersMetrics: Awaited<ReturnType<typeof toAnnualMetricsBundle>>;
    otherTeamUsers: Array<{ id: string; name: string }>;
    personTargetsByUserId: Record<
      string,
      Awaited<ReturnType<typeof getTargetMetricsBundle>>["annual"]["target"]
    >;
    monthlyKpi: Awaited<ReturnType<typeof getMonthlyKpiBundle>>;
    monthlyTargetsByUserId: Record<
      string,
      Awaited<ReturnType<typeof getMonthlyKpiBundle>>["targets"]
    >;
    salesUsers: Array<{ id: string; name: string }>;
    regularSalesUsers: Array<{ id: string; name: string }>;
    monthlyUsers: typeof monthlyUsers;
  } | null = null;

  let salesView: {
    metrics: Awaited<ReturnType<typeof getTargetMetricsBundle>>;
    monthlyKpi: Awaited<ReturnType<typeof getMonthlyKpiBundle>>;
  } | null = null;

  if (canManage && (salesUsers.length > 0 || monthlyUsers.length > 0)) {
    const viewPersonId =
      annualSubject === "team" || annualSubject === "others"
        ? (regularSalesUserIds[0] ?? salesUserIds[0] ?? session.user.id)
        : annualSubject;

    const [teamAnnual, othersAnnual, personMetrics, monthlyKpi, personBundles, monthlyBundles] =
      await Promise.all([
        getTeamAnnualMetrics(salesUserIds, year),
        getTeamAnnualMetrics(otherTeamUserIds, year),
        getTargetMetricsBundle(viewPersonId, year, month),
        monthlyUserIds.length > 0
          ? getMonthlyKpiBundle(monthlyUserId, year, month, now)
          : getMonthlyKpiBundle(session.user.id, year, month, now),
        Promise.all(
          salesUsers.map(async (user) => ({
            userId: user.id,
            target: (await getTargetMetricsBundle(user.id, year, month)).annual.target,
          }))
        ),
        Promise.all(
          monthlyUsers.map(async (user) => ({
            userId: user.id,
            targets: (await getMonthlyKpiBundle(user.id, year, month, now)).targets,
          }))
        ),
      ]);

    const teamMetrics = toAnnualMetricsBundle(year, month, teamAnnual);
    const othersMetrics = toAnnualMetricsBundle(year, month, othersAnnual);
    const displayPersonMetrics =
      annualSubject === "team" || annualSubject === "others"
        ? personMetrics
        : await getTargetMetricsBundle(annualSubject, year, month);

    managerView = {
      period,
      teamSize: salesUsers.length,
      annualSubject,
      subjectName:
        annualSubject === "team"
          ? "团队汇总"
          : annualSubject === "others"
            ? "其他"
            : subjectName,
      monthlyUserId,
      monthlyUserName,
      teamMetrics,
      personMetrics: displayPersonMetrics,
      othersMetrics,
      otherTeamUsers: otherTeamUsers.map(({ id, name }) => ({ id, name })),
      personTargetsByUserId: Object.fromEntries(
        personBundles.map((row) => [row.userId, row.target])
      ),
      monthlyKpi,
      monthlyTargetsByUserId: Object.fromEntries(
        monthlyBundles.map((row) => [row.userId, row.targets])
      ),
      salesUsers: salesUsers.map(({ id, name }) => ({ id, name })),
      regularSalesUsers: regularSalesUsers.map(({ id, name }) => ({ id, name })),
      monthlyUsers,
    };
  } else {
    const [metrics, monthlyKpi] = await Promise.all([
      getTargetMetricsBundle(session.user.id, year, month),
      getMonthlyKpiBundle(session.user.id, year, month, now),
    ]);
    salesView = { metrics, monthlyKpi };
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">指标</h1>
        <p className="text-xs text-muted-foreground">
          {canManage
            ? "查看团队与销售指标汇总；目标设定请在电脑端完成"
            : "查看本人指标汇总；目标设定请在电脑端完成"}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 pb-8">
        {managerView ? (
          <ManagerMetricsOverview
            period={managerView.period}
            year={year}
            month={month}
            teamSize={managerView.teamSize}
            annualSubject={managerView.annualSubject}
            subjectName={managerView.subjectName}
            monthlyUserId={managerView.monthlyUserId}
            monthlyUserName={managerView.monthlyUserName}
            teamMetrics={managerView.teamMetrics}
            personMetrics={managerView.personMetrics}
            othersMetrics={managerView.othersMetrics}
            otherTeamUsers={managerView.otherTeamUsers}
            personTargetsByUserId={managerView.personTargetsByUserId}
            monthlyKpi={managerView.monthlyKpi}
            monthlyTargetsByUserId={managerView.monthlyTargetsByUserId}
            salesUsers={managerView.salesUsers}
            regularSalesUsers={managerView.regularSalesUsers}
            monthlyUsers={managerView.monthlyUsers}
            nowYear={nowYear}
            nowMonth={nowMonth}
            allowTargetSettings={false}
            recentYearsOnly
          />
        ) : null}

        {salesView ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">我的指标</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">可切换今年或去年查看完成度</p>
              </div>
              <SalesMetricsTimeSelect
                year={year}
                month={month}
                nowYear={nowYear}
                nowMonth={nowMonth}
                recentYearsOnly
              />
            </div>
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">
                  {year} 年 {month} 月 KPI
                </h2>
                <p className="text-xs text-muted-foreground">
                  渠道 / 项目 / 回款催收 / 过程规范 / 维护赋能
                </p>
              </div>
              <MonthlyKpiDashboard kpi={salesView.monthlyKpi} />
            </section>
            <TargetMetricsDashboard
              metrics={salesView.metrics}
              subjectName={session.user.name}
            />
          </div>
        ) : null}

        {canManage && !managerView ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无计入团队业绩或月度考核的销售人员，请在电脑端「销售人员」中配置。
          </p>
        ) : null}
      </div>
    </div>
  );
}
