import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { CostSummaryCards } from "@/components/projects/cost-summary-cards";
import { ProjectOverviewForm } from "@/components/projects/project-overview-form";
import { ProjectPlanPanel } from "@/components/projects/project-plan-panel";
import { ProjectPlanChrome } from "@/components/projects/project-plan-chrome";
import {
  canManageProject,
  canEditProjectContent,
  canDeleteProject,
  buildProjectListWhere,
  canAccessResourceSchedule,
  getProjectMemberAccessLevel,
} from "@/lib/projects/access";
import { getProjectCostSummary } from "@/lib/projects/cost-summary";
import { clearActualStartIfNoAllocations } from "@/lib/projects/project-actual-dates";
import { PROJECT_STATUS_LABELS, ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { PROJECT_TABS, parseProjectTab } from "@/lib/validations/project";
import { formatAmount } from "@/lib/opportunities/funnel";
import { selfReturnPath, withReturnTo } from "@/lib/navigation/return-to";
import { ProjectScheduleEmbed } from "@/components/projects/project-schedule-embed";
import { ProjectMemberAccessPanel } from "@/components/projects/project-member-access-panel";
import { ProjectExpenseClaimsPanel } from "@/components/projects/project-expense-claims-panel";
import { ProjectDeliveryPanel } from "@/components/projects/project-delivery-panel";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { hasPermission } from "@/lib/rbac/has-permission";
import type { ProjectMemberAccess } from "@prisma/client";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    taskId?: string;
    returnTo?: string;
    range?: string;
    start?: string;
    end?: string;
    week?: string;
    axis?: string;
  }>;
};

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const activeTab = parseProjectTab(query.tab);
  const initialTaskId = query.taskId?.trim() || null;

  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
    "SALES_MANAGER",
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

  const selfPath = selfReturnPath(`/projects/${id}`, query);

  const memberAccessLevel = await getProjectMemberAccessLevel(project.id, session.user.id);
  const canManage = canManageProject(session.user.role, session.user.id, project);
  const canEdit = canEditProjectContent(
    session.user.role,
    session.user.id,
    project,
    memberAccessLevel
  );
  const canDelete = canDeleteProject(session.user.role);
  const canSchedule = canAccessResourceSchedule(session.user.role);
  const canExpenseAccess = await hasPermission(session.user.role, "expense.access");
  const resolvedTab =
    activeTab === "schedule" && !canSchedule ? "overview" : activeTab;
  // 无人力投入时不应保留实际开始（历史误填常等于计划开始）
  if (project.actualStartAt) {
    const cleared = await clearActualStartIfNoAllocations(project.id);
    if (cleared) project.actualStartAt = null;
  }
  const [costSummary, projectModels, allocationUsers, allocationSpan, sourceModelPhases, projectMemos, projectMembers, projectExpenseClaims, acceptances, changeRequests] =
    await Promise.all([
      getProjectCostSummary(project.id),
      resolvedTab === "plan"
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
      resolvedTab === "plan" || (resolvedTab === "overview" && canManage)
        ? prisma.projectStaffAllocation.findMany({
            where: { projectId: project.id },
            distinct: ["userId"],
            select: {
              user: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      resolvedTab === "plan"
        ? prisma.projectStaffAllocation.aggregate({
            where: { projectId: project.id },
            _max: { endDate: true },
          })
        : Promise.resolve({ _max: { endDate: null as Date | null } }),
      resolvedTab === "plan" && project.sourceModelId
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
      resolvedTab === "plan"
        ? prisma.projectMemo.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: "desc" },
            include: {
              author: { select: { name: true } },
              taskLinks: {
                include: { task: { select: { id: true, name: true } } },
              },
            },
          })
        : Promise.resolve([]),
      resolvedTab === "overview" && canManage
        ? prisma.projectMember.findMany({
            where: { projectId: project.id },
            select: {
              userId: true,
              accessLevel: true,
              user: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      resolvedTab === "costs" && isExpenseFeatureEnabled()
        ? prisma.expenseClaim.findMany({
            where: {
              OR: [
                { projectId: project.id },
                { items: { some: { projectId: project.id } } },
                { invoices: { some: { projectId: project.id } } },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: {
              id: true,
              title: true,
              status: true,
              totalAmount: true,
              updatedAt: true,
              applicant: { select: { name: true } },
              beneficiary: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      resolvedTab === "delivery"
        ? prisma.projectAcceptance.findMany({
            where: { projectId: project.id },
            orderBy: { acceptedAt: "desc" },
            include: { createdBy: { select: { name: true } } },
          })
        : Promise.resolve([]),
      resolvedTab === "delivery"
        ? prisma.projectChangeRequest.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: "desc" },
            include: {
              requester: { select: { id: true, name: true } },
              reviewer: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  const scheduleHref = canSchedule
    ? `/projects/${project.id}?tab=schedule`
    : null;

  const templateTasksByPhaseId: Record<
    string,
    Array<{ id: string; name: string; durationDays: number }>
  > = {};
  for (const modelPhase of sourceModelPhases) {
    templateTasksByPhaseId[modelPhase.id] = modelPhase.tasks;
  }

  const assignees = allocationUsers.map((row) => row.user);

  const accessCandidates = (() => {
    if (!canManage || resolvedTab !== "overview") return [];
    type Acc = {
      userId: string;
      name: string;
      accessLevel: ProjectMemberAccess;
      sources: Set<string>;
    };
    const map = new Map<string, Acc>();
    const ensure = (userId: string, name: string, source: string, level?: ProjectMemberAccess) => {
      if (project.projectManagerId && userId === project.projectManagerId) return;
      const existing = map.get(userId);
      if (existing) {
        existing.sources.add(source);
        if (level) existing.accessLevel = level;
        return;
      }
      map.set(userId, {
        userId,
        name,
        accessLevel: level ?? "NONE",
        sources: new Set([source]),
      });
    };
    for (const m of projectMembers) {
      ensure(m.userId, m.user.name, "成员", m.accessLevel);
    }
    for (const phase of project.phases) {
      for (const task of phase.projectTasks) {
        if (task.assignee) ensure(task.assignee.id, task.assignee.name, "任务负责人");
      }
    }
    for (const row of allocationUsers) {
      ensure(row.user.id, row.user.name, "排班");
    }
    return [...map.values()]
      .map((row) => ({
        userId: row.userId,
        name: row.name,
        accessLevel: row.accessLevel,
        sources: [...row.sources],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  })();

  const tabs = PROJECT_TABS.filter((tab) => canSchedule || tab.id !== "schedule").map(
    (tab) => ({
      ...tab,
      href: `/projects/${project.id}?tab=${tab.id}`,
    })
  );

  const planPanel =
    resolvedTab === "plan" ? (
      <ProjectPlanChrome
        projectName={project.name}
        customerName={project.customer?.name ?? null}
      >
        <ProjectPlanPanel
          projectId={project.id}
          canEdit={canEdit}
          plannedStartAt={project.plannedStartAt}
          plannedEndAt={project.plannedEndAt}
          allocationSpanEnd={allocationSpan._max.endDate}
          scheduleHref={scheduleHref}
          initialTaskId={initialTaskId}
          assignees={assignees}
          templateTasksByPhaseId={templateTasksByPhaseId}
          memos={projectMemos.map((memo) => ({
            id: memo.id,
            content: memo.content,
            category: memo.category,
            isRisk: memo.isRisk,
            followStatus: memo.followStatus,
            authorName: memo.author.name,
            createdAt: memo.createdAt,
            taskLinks: memo.taskLinks.map((link) => ({
              taskId: link.task.id,
              taskName: link.task.name,
            })),
          }))}
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
              progressPercent: task.progressPercent,
              actualCompletedAt: task.actualCompletedAt,
              cancelledNote: task.cancelledNote,
              sortOrder: task.sortOrder,
              assigneeId: task.assigneeId,
              assigneeName: task.assignee?.name ?? null,
            })),
          }))}
        />
      </ProjectPlanChrome>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.customer && project.customer.name !== project.name ? (
              <>
                客户：
                <Link
                  href={withReturnTo(`/customers/${project.customer.id}`, selfPath)}
                  className="hover:underline"
                >
                  {project.customer.name}
                </Link>
                {" · "}
              </>
            ) : null}
            {!project.customer ? <span>内部/独立项目 · </span> : null}
            {project.projectManager ? `项目经理：${project.projectManager.name} · ` : ""}
            {PROJECT_STATUS_LABELS[project.status]}
          </p>
          {project.contract ? (
            <p className="text-sm text-muted-foreground">
              关联合同：
              <Link
                href={withReturnTo(`/contracts/${project.contract.id}`, selfPath)}
                className="hover:underline"
              >
                {project.contract.title}
              </Link>
              {` · ${formatAmount(Number(project.contract.totalAmount))}`}
            </p>
          ) : null}
        </div>
      </div>

      <ProjectTabs
        activeTab={resolvedTab}
        tabs={tabs}
        showFullscreen={resolvedTab === "plan" || resolvedTab === "schedule"}
      />

      {planPanel}

      {resolvedTab === "overview" ? (
        <div className="space-y-6">
          <CostSummaryCards summary={costSummary} />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">项目概览</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectOverviewForm
                projectId={project.id}
                projectName={project.name}
                canEdit={canManage}
                canDelete={canDelete}
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
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">访问权限</CardTitle>
              </CardHeader>
              <CardContent>
                <ProjectMemberAccessPanel
                  projectId={project.id}
                  candidates={accessCandidates}
                />
              </CardContent>
            </Card>
          ) : null}
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

      {resolvedTab === "schedule" && canSchedule ? (
        <ProjectScheduleEmbed
          projectId={project.id}
          role={session.user.role}
          userId={session.user.id}
          canEdit={canEdit}
          query={{
            range: query.range,
            start: query.start,
            end: query.end,
            week: query.week,
            axis: query.axis,
          }}
        />
      ) : null}

      {resolvedTab === "costs" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">发生费用</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectExpenseClaimsPanel
              projectId={project.id}
              projectName={project.name}
              expenseCost={costSummary.expenseCost}
              claims={projectExpenseClaims}
              canCreate={canExpenseAccess && (canEdit || canManage)}
            />
          </CardContent>
        </Card>
      ) : null}

      {resolvedTab === "delivery" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">验收与变更</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectDeliveryPanel
              projectId={project.id}
              canEdit={canEdit || canManage}
              canReview={
                canManage ||
                session.user.role === "PROJECT_ADMIN" ||
                session.user.role === "ADMIN"
              }
              currentUserId={session.user.id}
              acceptances={acceptances}
              changeRequests={changeRequests}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
