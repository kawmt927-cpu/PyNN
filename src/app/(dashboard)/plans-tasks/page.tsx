import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTargetMetricsBundle } from "@/lib/plans-tasks/metrics";
import { getMonthlyKpiBundle } from "@/lib/plans-tasks/monthly-kpi";
import { getSalesKpiConfig } from "@/lib/plans-tasks/kpi-config";
import { CONFIG_CATEGORY, getConfigOptions } from "@/lib/config-options";
import { TargetMetricsDashboard } from "@/components/plans-tasks/target-metrics-dashboard";
import { MonthlyKpiDashboard } from "@/components/plans-tasks/monthly-kpi-dashboard";
import { TargetSettingsPanel } from "@/components/plans-tasks/target-settings-panel";
import { MonthlyKpiSettingsPanel } from "@/components/plans-tasks/monthly-kpi-settings-panel";
import { AssignmentsTaskList } from "@/components/plans-tasks/assignments-task-list";
import { PlansTasksTabs } from "@/components/plans-tasks/plans-tasks-tabs";
import { parsePlansTasksTab } from "@/lib/plans-tasks/tabs";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";

type Props = {
  searchParams: Promise<{ tab?: string; userId?: string }>;
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

  const viewUserId =
    canManage && query.userId && salesUsers.some((u) => u.id === query.userId)
      ? query.userId
      : session.user.id;

  const viewUser =
    viewUserId === session.user.id
      ? { id: session.user.id, name: session.user.name }
      : salesUsers.find((u) => u.id === viewUserId) ?? { id: session.user.id, name: session.user.name };

  const [metrics, monthlyKpi, kpiConfig, stageOptions] =
    tab === "dashboard"
      ? await Promise.all([
          getTargetMetricsBundle(viewUserId, year, month),
          getMonthlyKpiBundle(viewUserId, year, month, now),
          getSalesKpiConfig(),
          getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
        ])
      : [null, null, null, []];

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

      {tab === "dashboard" && metrics && monthlyKpi ? (
        <div className="space-y-6">
          {canManage && salesUsers.length > 0 ? (
            <>
              <TargetSettingsPanel
                userId={viewUserId}
                year={year}
                metrics={metrics}
                salesUsers={salesUsers}
              />
              <MonthlyKpiSettingsPanel
                userId={viewUserId}
                year={year}
                month={month}
                kpi={monthlyKpi}
                stageOptions={stageOptions}
                projectDevMinStageValue={kpiConfig?.projectDevMinStageValue ?? null}
              />
            </>
          ) : null}
          <MonthlyKpiDashboard kpi={monthlyKpi} />
          <TargetMetricsDashboard metrics={metrics} subjectName={viewUser.name} />
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
