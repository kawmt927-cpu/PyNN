import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getTargetMetricsBundle,
  getTeamAnnualMetrics,
  toAnnualMetricsBundle,
} from "@/lib/plans-tasks/metrics";
import { getMonthlyKpiBundle } from "@/lib/plans-tasks/monthly-kpi";
import { TargetMetricsDashboard } from "@/components/plans-tasks/target-metrics-dashboard";
import { MonthlyKpiDashboard } from "@/components/plans-tasks/monthly-kpi-dashboard";
import { ManagerMetricsOverview } from "@/components/plans-tasks/manager-metrics-overview";
import { AssignmentsTaskList } from "@/components/plans-tasks/assignments-task-list";
import { PlansTasksTabs } from "@/components/plans-tasks/plans-tasks-tabs";
import { parsePlansTasksTab } from "@/lib/plans-tasks/tabs";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import {
  parseAnnualSubject,
  parseMetricsPeriod,
  resolveMonthlyUserId,
} from "@/lib/plans-tasks/metrics-scope";

type Props = {
  searchParams: Promise<{
    tab?: string;
    period?: string;
    subject?: string;
    userId?: string;
    monthlyUserId?: string;
  }>;
};

export default async function PlansTasksPage({ searchParams }: Props) {
  const query = await searchParams;
  const tab = parsePlansTasksTab(query.tab);
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const canManage = canManageWeeklyAssignments(session.user.role);

  const salesUsers = canManage
    ? await prisma.user.findMany({
        where: { role: { in: ["SALES", "SALES_MANAGER"] }, personnelProfile: { enabled: true } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const salesUserIds = salesUsers.map((u) => u.id);
  const period = parseMetricsPeriod(query, canManage);
  const annualSubject = parseAnnualSubject(query, salesUserIds);
  const monthlyUserId = canManage
    ? resolveMonthlyUserId(query, salesUserIds, session.user.id)
    : session.user.id;

  const subjectName =
    annualSubject === "team"
      ? "团队汇总"
      : salesUsers.find((u) => u.id === annualSubject)?.name ?? session.user.name;
  const monthlyUserName =
    salesUsers.find((u) => u.id === monthlyUserId)?.name ?? session.user.name;

  const dashboardData =
    tab === "dashboard"
      ? await (async () => {
          if (canManage && salesUsers.length > 0) {
            const viewPersonId =
              annualSubject === "team" ? salesUserIds[0] : annualSubject;

            const [
              teamAnnual,
              personMetrics,
              monthlyKpi,
              personBundles,
              monthlyBundles,
            ] = await Promise.all([
              getTeamAnnualMetrics(salesUserIds, year),
              getTargetMetricsBundle(viewPersonId, year, month),
              getMonthlyKpiBundle(monthlyUserId, year, month, now),
              Promise.all(
                salesUsers.map(async (user) => ({
                  userId: user.id,
                  target: (await getTargetMetricsBundle(user.id, year, month)).annual.target,
                }))
              ),
              Promise.all(
                salesUsers.map(async (user) => ({
                  userId: user.id,
                  targets: (await getMonthlyKpiBundle(user.id, year, month, now)).targets,
                }))
              ),
            ]);

            const teamMetrics = toAnnualMetricsBundle(year, month, teamAnnual);
            const displayPersonMetrics =
              annualSubject === "team"
                ? personMetrics
                : await getTargetMetricsBundle(annualSubject, year, month);

            const personTargetsByUserId = Object.fromEntries(
              personBundles.map((row) => [row.userId, row.target])
            ) as Record<string, (typeof personBundles)[0]["target"]>;
            const monthlyTargetsByUserId = Object.fromEntries(
              monthlyBundles.map((row) => [row.userId, row.targets])
            ) as Record<string, (typeof monthlyBundles)[0]["targets"]>;

            return {
              manager: {
                period,
                teamSize: salesUsers.length,
                annualSubject,
                subjectName:
                  annualSubject === "team" ? "团队汇总" : subjectName,
                monthlyUserId,
                monthlyUserName,
                teamMetrics,
                personMetrics: displayPersonMetrics,
                personTargetsByUserId,
                monthlyKpi,
                monthlyTargetsByUserId,
                salesUsers,
              },
            };
          }

          const [metrics, monthlyKpi] = await Promise.all([
            getTargetMetricsBundle(session.user.id, year, month),
            getMonthlyKpiBundle(session.user.id, year, month, now),
          ]);
          return { sales: { metrics, monthlyKpi } };
        })()
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">计划与任务</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          查看年度/月度指标完成度，追踪管理员指派的全部任务。
        </p>
      </div>

      <Suspense fallback={<div className="h-10 border-b" />}>
        <PlansTasksTabs active={tab} />
      </Suspense>

      {tab === "dashboard" && dashboardData?.manager ? (
        <ManagerMetricsOverview
          period={dashboardData.manager.period}
          year={year}
          month={month}
          teamSize={dashboardData.manager.teamSize}
          annualSubject={dashboardData.manager.annualSubject}
          subjectName={dashboardData.manager.subjectName}
          monthlyUserId={dashboardData.manager.monthlyUserId}
          monthlyUserName={dashboardData.manager.monthlyUserName}
          teamMetrics={dashboardData.manager.teamMetrics}
          personMetrics={dashboardData.manager.personMetrics}
          personTargetsByUserId={dashboardData.manager.personTargetsByUserId}
          monthlyKpi={dashboardData.manager.monthlyKpi}
          monthlyTargetsByUserId={dashboardData.manager.monthlyTargetsByUserId}
          salesUsers={dashboardData.manager.salesUsers}
        />
      ) : null}

      {tab === "dashboard" && dashboardData?.sales ? (
        <div className="space-y-6">
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                {year} 年 {month} 月 KPI
              </h2>
              <p className="text-sm text-muted-foreground">渠道/项目/回款催收/过程规范/维护赋能五项月度指标</p>
            </div>
            <MonthlyKpiDashboard kpi={dashboardData.sales.monthlyKpi} />
          </section>
          <TargetMetricsDashboard
            metrics={dashboardData.sales.metrics}
            subjectName={session.user.name}
          />
        </div>
      ) : null}

      {tab === "tasks" ? (
        <AssignmentsTaskList
          role={session.user.role}
          userId={session.user.id}
          returnPath="/plans-tasks?tab=tasks"
        />
      ) : null}
    </div>
  );
}
