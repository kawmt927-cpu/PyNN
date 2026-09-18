import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requireSession } from "@/lib/session";
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
import {
  getPlansTasksCapabilities,
  parsePlansTasksTab,
} from "@/lib/plans-tasks/tabs";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import {
  parseAnnualSubject,
  parseMetricsMonth,
  parseMetricsPeriod,
  parseMetricsYear,
  resolveMonthlyUserId,
} from "@/lib/plans-tasks/metrics-scope";
import { SalesMetricsTimeSelect } from "@/components/plans-tasks/metrics-period-switch";
import {
  teamPerformanceMemberWhere,
  monthlyAssessmentMemberWhere,
} from "@/lib/sales/team-performance";
import { MyProjectTasksPanel } from "@/components/projects/my-project-tasks-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_ROLES: UserRole[] = [
  "SALES",
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "PROJECT_STAFF",
  "ADMIN",
];

type Props = {
  searchParams: Promise<{
    tab?: string;
    period?: string;
    subject?: string;
    userId?: string;
    monthlyUserId?: string;
    year?: string;
    month?: string;
  }>;
};

export default async function PlansTasksPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await requireSession();
  const role = session.user.role as UserRole;
  if (!PAGE_ROLES.includes(role)) {
    redirect("/");
  }

  const capabilities = getPlansTasksCapabilities(role);
  if (!capabilities.salesTasks && !capabilities.projectTasks && !capabilities.dashboard) {
    redirect("/");
  }

  const tab = parsePlansTasksTab(query.tab, capabilities);
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const year = parseMetricsYear(query, now);
  const month = parseMetricsMonth(query, year, now);
  const canManage = canManageWeeklyAssignments(role);

  const [salesUsers, monthlyUsers, projectTasks] = await Promise.all([
    capabilities.salesTasks && canManage
      ? prisma.user.findMany({
          where: teamPerformanceMemberWhere(),
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    capabilities.salesTasks && canManage
      ? prisma.user.findMany({
          where: monthlyAssessmentMemberWhere(),
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    tab === "project" && capabilities.projectTasks
      ? prisma.projectTask.findMany({
          where: { assigneeId: session.user.id },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            progressPercent: true,
            plannedStartAt: true,
            plannedEndAt: true,
            projectId: true,
            project: {
              select: {
                name: true,
                projectManagerId: true,
              },
            },
            phase: { select: { name: true } },
          },
          orderBy: [{ plannedEndAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const projectAccessById =
    tab === "project" && projectTasks.length > 0
      ? await (async () => {
          const projectIds = [...new Set(projectTasks.map((t) => t.projectId))];
          if (role === "ADMIN" || role === "PROJECT_ADMIN") {
            return new Map(projectIds.map((id) => [id, true as boolean]));
          }
          const members = await prisma.projectMember.findMany({
            where: {
              userId: session.user.id,
              projectId: { in: projectIds },
              accessLevel: { in: ["VIEW", "EDIT"] },
            },
            select: { projectId: true },
          });
          const openable = new Set(members.map((m) => m.projectId));
          return new Map(
            projectIds.map((id) => {
              const task = projectTasks.find((t) => t.projectId === id);
              const isPm = task?.project.projectManagerId === session.user.id;
              return [id, isPm || openable.has(id)] as const;
            })
          );
        })()
      : new Map<string, boolean>();

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

  const dashboardData =
    tab === "dashboard" && capabilities.dashboard
      ? await (async () => {
          if (canManage && (salesUsers.length > 0 || monthlyUsers.length > 0)) {
            const viewPersonId =
              annualSubject === "team" || annualSubject === "others"
                ? (regularSalesUserIds[0] ?? salesUserIds[0] ?? session.user.id)
                : annualSubject;

            const [
              teamAnnual,
              othersAnnual,
              personMetrics,
              monthlyKpi,
              personBundles,
              monthlyBundles,
            ] = await Promise.all([
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

            return {
              manager: {
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
                ) as Record<string, (typeof personBundles)[0]["target"]>,
                monthlyKpi,
                monthlyTargetsByUserId: Object.fromEntries(
                  monthlyBundles.map((row) => [row.userId, row.targets])
                ) as Record<string, (typeof monthlyBundles)[0]["targets"]>,
                salesUsers: salesUsers.map(({ id, name }) => ({ id, name })),
                regularSalesUsers: regularSalesUsers.map(({ id, name }) => ({ id, name })),
                monthlyUsers,
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

  const subtitle = capabilities.salesTasks && capabilities.projectTasks
    ? "销售指派任务与项目计划任务分栏查看；销售侧还可看指标概览。"
    : capabilities.projectTasks
      ? "查看指派给你的项目计划任务，更新工作状态。"
      : "查看月度/年度指标完成度，追踪管理员指派的全部任务。";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">计划与任务</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <Suspense fallback={<div className="h-10 border-b" />}>
        <PlansTasksTabs active={tab} capabilities={capabilities} />
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
          othersMetrics={dashboardData.manager.othersMetrics}
          otherTeamUsers={dashboardData.manager.otherTeamUsers}
          personTargetsByUserId={dashboardData.manager.personTargetsByUserId}
          monthlyKpi={dashboardData.manager.monthlyKpi}
          monthlyTargetsByUserId={dashboardData.manager.monthlyTargetsByUserId}
          salesUsers={dashboardData.manager.salesUsers}
          regularSalesUsers={dashboardData.manager.regularSalesUsers}
          monthlyUsers={dashboardData.manager.monthlyUsers}
          nowYear={nowYear}
          nowMonth={nowMonth}
        />
      ) : null}

      {tab === "dashboard" && dashboardData?.sales ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">我的指标</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                切换年月可查看历史月度 KPI 与年度考核完成度
              </p>
            </div>
            <SalesMetricsTimeSelect
              year={year}
              month={month}
              nowYear={nowYear}
              nowMonth={nowMonth}
            />
          </div>
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                {year} 年 {month} 月 KPI
              </h2>
              <p className="text-sm text-muted-foreground">
                渠道/项目/回款催收/过程规范/维护赋能五项月度指标
              </p>
            </div>
            <MonthlyKpiDashboard kpi={dashboardData.sales.monthlyKpi} />
          </section>
          <TargetMetricsDashboard
            metrics={dashboardData.sales.metrics}
            subjectName={session.user.name}
          />
        </div>
      ) : null}

      {tab === "tasks" && capabilities.salesTasks ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">销售任务</h2>
            <p className="text-sm text-muted-foreground">
              管理员指派的周任务、催收回款与待办确认
            </p>
          </div>
          <AssignmentsTaskList
            role={role}
            userId={session.user.id}
            returnPath="/plans-tasks?tab=tasks"
          />
        </div>
      ) : null}

      {tab === "project" && capabilities.projectTasks ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">项目任务</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              项目计划中指派给你的任务；可更新状态并跳转到对应项目计划
            </p>
          </CardHeader>
          <CardContent>
            <MyProjectTasksPanel
              tasks={projectTasks.map((task) => ({
                id: task.id,
                name: task.name,
                description: task.description,
                status: task.status,
                progressPercent: task.progressPercent,
                plannedStartAt: task.plannedStartAt,
                plannedEndAt: task.plannedEndAt,
                projectId: task.projectId,
                projectName: task.project.name,
                phaseName: task.phase.name,
                canOpenPlan: projectAccessById.get(task.projectId) === true,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
