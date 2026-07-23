import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/navigation/back-link";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { CostSummaryCards } from "@/components/projects/cost-summary-cards";
import { ProjectOverviewForm } from "@/components/projects/project-overview-form";
import { ProjectPlanPanel } from "@/components/projects/project-plan-panel";
import { canManageProject, buildProjectListWhere } from "@/lib/projects/access";
import { getProjectCostSummary } from "@/lib/projects/cost-summary";
import { clearActualStartIfNoAllocations } from "@/lib/projects/project-actual-dates";
import { buildScheduleModuleHref } from "@/lib/projects/timeline";
import { PROJECT_STATUS_LABELS, ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { PROJECT_TABS, parseProjectTab } from "@/lib/validations/project";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatLocalDateInput } from "@/lib/dates/local-date";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; taskId?: string }>;
};

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: rawTab, taskId: rawTaskId } = await searchParams;
  const activeTab = parseProjectTab(rawTab);
  const initialTaskId = rawTaskId?.trim() || null;

  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
  ]);

  const project = await prisma.project.findFirst({
    where: { id, ...buildProjectListWhere(session.user.role, session.user.id) },
    include: {
      customer: { select: { id: true, name: true } },
      projectManager: { select: { name: true } },
      contract: { select: { id: true, title: true, totalAmount: true } },
      phases: {
        orderBy: { sortOrder: "asc" },
        include: {
          projectTasks: {
            orderBy: { sortOrder: "asc" },
            include: { assignee: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const canEdit = canManageProject(session.user.role, session.user.id, project);
  // 无人力投入时不应保留实际开始（历史误填常等于计划开始）
  if (project.actualStartAt) {
    const cleared = await clearActualStartIfNoAllocations(project.id);
    if (cleared) project.actualStartAt = null;
  }
  const [costSummary, projectModels, allocationUsers, sourceModelPhases] = await Promise.all([
    getProjectCostSummary(project.id),
    activeTab === "plan"
      ? prisma.projectModel.findMany({
          where: { enabled: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            totalDurationDays: true,
            _count: { select: { phases: true } },
          },
        })
      : Promise.resolve([]),
    activeTab === "plan"
      ? prisma.projectStaffAllocation.findMany({
          where: { projectId: project.id },
          distinct: ["userId"],
          select: {
            user: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    activeTab === "plan" && project.sourceModelId
      ? prisma.projectModelPhase.findMany({
          where: { modelId: project.sourceModelId },
          select: {
            id: true,
            tasks: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, durationDays: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const scheduleHref = buildScheduleModuleHref({
    view: "detail",
    project: project.id,
  });

  const templateTasksByPhaseId: Record<
    string,
    Array<{ id: string; name: string; durationDays: number }>
  > = {};
  for (const modelPhase of sourceModelPhases) {
    templateTasksByPhaseId[modelPhase.id] = modelPhase.tasks;
  }

  const assignees = allocationUsers.map((row) => row.user);

  const tabs = PROJECT_TABS.map((tab) => ({
    ...tab,
    href: `/projects/${project.id}?tab=${tab.id}`,
  }));

  if (activeTab === "plan") {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-4">
            <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
              <Link href={`/projects/${project.id}?tab=overview`}>返回概览</Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">项目计划 · {project.name}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {project.customer?.name ?? "内部项目"}
                {project.plannedStartAt && project.plannedEndAt
                  ? ` · ${formatLocalDateInput(project.plannedStartAt)} ~ ${formatLocalDateInput(project.plannedEndAt)}`
                  : " · 未设置计划起止"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/projects">项目列表</Link>
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <ProjectPlanPanel
            projectId={project.id}
            canEdit={canEdit}
            plannedStartAt={project.plannedStartAt}
            plannedEndAt={project.plannedEndAt}
            scheduleHref={scheduleHref}
            initialTaskId={initialTaskId}
            assignees={assignees}
            templateTasksByPhaseId={templateTasksByPhaseId}
            projectModels={projectModels.map((model) => ({
              id: model.id,
              name: model.name,
              phaseCount: model._count.phases,
              totalDurationDays: model.totalDurationDays,
            }))}
            phases={project.phases.map((phase) => ({
              id: phase.id,
              name: phase.name,
              sortOrder: phase.sortOrder,
              progressWeight: phase.progressWeight,
              status: phase.status,
              plannedStartAt: phase.plannedStartAt,
              plannedEndAt: phase.plannedEndAt,
              sourceModelPhaseId: phase.sourceModelPhaseId,
              tasks: phase.projectTasks.map((task) => ({
                id: task.id,
                name: task.name,
                description: task.description,
                status: task.status,
                plannedStartAt: task.plannedStartAt,
                plannedEndAt: task.plannedEndAt,
                actualCompletedAt: task.actualCompletedAt,
                cancelledNote: task.cancelledNote,
                sortOrder: task.sortOrder,
                assigneeId: task.assigneeId,
                assigneeName: task.assignee?.name ?? null,
              })),
            }))}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink href="/projects" label="返回项目列表" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            客户：
            {project.customer ? (
              <Link href={`/customers/${project.customer.id}`} className="hover:underline">
                {project.customer.name}
              </Link>
            ) : (
              <span>内部/独立项目</span>
            )}
            {project.projectManager ? ` · 项目经理：${project.projectManager.name}` : ""}
            {` · ${PROJECT_STATUS_LABELS[project.status]}`}
          </p>
          {project.contract ? (
            <p className="text-sm text-muted-foreground">
              关联合同：
              <Link href={`/contracts/${project.contract.id}`} className="hover:underline">
                {project.contract.title}
              </Link>
              {` · ${formatAmount(Number(project.contract.totalAmount))}`}
            </p>
          ) : null}
        </div>
      </div>

      <ProjectTabs activeTab={activeTab} tabs={tabs} />

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <CostSummaryCards summary={costSummary} />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">项目概览</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectOverviewForm
                projectId={project.id}
                canEdit={canEdit}
                phaseCount={project.phases.length}
                defaultValues={{
                  status: project.status,
                  progressPercent: project.progressPercent,
                  plannedStartAt: project.plannedStartAt,
                  plannedEndAt: project.plannedEndAt,
                  actualStartAt: project.actualStartAt,
                  actualEndAt: project.actualEndAt,
                  notes: project.notes,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">人力成本明细</CardTitle>
            </CardHeader>
            <CardContent>
              {costSummary.laborLines.length === 0 ? (
                <p className="text-muted-foreground">暂无人力投入。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">人员</th>
                        <th className="pb-2 pr-4">模式</th>
                        <th className="pb-2 pr-4">计算人天</th>
                        <th className="pb-2 pr-4">分摊成本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costSummary.laborLines.map((line) => (
                        <tr key={line.allocationId} className="border-b">
                          <td className="py-3 pr-4">{line.userName}</td>
                          <td className="py-3 pr-4">
                            {ALLOCATION_MODE_LABELS[
                              line.allocationMode as keyof typeof ALLOCATION_MODE_LABELS
                            ] ?? line.allocationMode}
                          </td>
                          <td className="py-3 pr-4">{line.effectiveDays}</td>
                          <td className="py-3 pr-4">{formatAmount(line.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "schedule" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">资源排班</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              排班已独立为全屏模块：左侧人员列表（搜索/筛选），右侧按项目切换甘特图，并支持全局总览与选中人员跨项目视图。
            </p>
            <Button asChild>
              <Link href={scheduleHref}>打开资源排班</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "costs" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">发生费用</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              发生费用录入功能将在下一阶段实现。当前已计入费用合计：
              {formatAmount(costSummary.expenseCost)}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
