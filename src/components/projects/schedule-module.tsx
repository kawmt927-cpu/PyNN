"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  SCHEDULE_MODULE_DAY_WIDTH,
  SCHEDULE_MODULE_MONTH_DAY_WIDTH,
  buildScheduleModuleHref,
  buildTimelineDays,
  datesFromPeriodDrop,
  formatPeriodLabel,
  periodStartKey,
  shiftPeriod,
  type ScheduleModuleView,
  type SchedulePeriod,
  type ScheduleProjectScope,
} from "@/lib/projects/timeline";
import type {
  ScheduleBar,
  ScheduleModuleData,
  ScheduleStaff,
} from "@/lib/projects/schedule-serialize";
import type { AllocationRecord } from "@/lib/projects/allocation-split";
import { ScheduleStaffPanel } from "@/components/projects/schedule-staff-panel";
import { ScheduleProjectCards } from "@/components/projects/schedule-project-cards";
import {
  ScheduleTimelineHeader,
  ScheduleTimelineRow,
  ScheduleTimelineAddRow,
} from "@/components/projects/schedule-timeline";
import { AllocationEditDialog } from "@/components/projects/allocation-edit-dialog";
import { createProjectAllocationFromDrag } from "@/app/(dashboard)/projects/allocation-actions";

const ROW_LABEL_WIDTH = 160;
const ALL_PROJECTS = "all";

type Props = {
  data: ScheduleModuleData;
  canEdit: boolean;
  view: ScheduleModuleView;
  projectScope: ScheduleProjectScope;
  lockedPersonIds: string[];
  peerRecordsByUser: Record<string, AllocationRecord[]>;
};

export function ScheduleModule({
  data,
  canEdit,
  view,
  projectScope,
  lockedPersonIds,
  peerRecordsByUser,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeStaff, setActiveStaff] = useState<ScheduleStaff | null>(null);
  const [selectedBar, setSelectedBar] = useState<ScheduleBar | null>(null);

  const period: SchedulePeriod = useMemo(
    () => ({
      mode: data.period.mode,
      from: new Date(data.period.from),
      to: new Date(data.period.to),
    }),
    [data.period]
  );

  const periodKey = periodStartKey(period);
  const days = useMemo(() => buildTimelineDays(period), [period]);
  const dayWidth =
    period.mode === "month" ? SCHEDULE_MODULE_MONTH_DAY_WIDTH : SCHEDULE_MODULE_DAY_WIDTH;
  const periodLabel = period.mode === "month" ? "本月" : "本周";
  const hasLocks = lockedPersonIds.length > 0;
  const lockedSet = useMemo(() => new Set(lockedPersonIds), [lockedPersonIds]);

  const barsByProject = useMemo(() => {
    const map = new Map<string, ScheduleBar[]>();
    for (const bar of data.allBars) {
      if (hasLocks && !lockedSet.has(bar.userId)) continue;
      const list = map.get(bar.projectId) ?? [];
      list.push(bar);
      map.set(bar.projectId, list);
    }
    return map;
  }, [data.allBars, hasLocks, lockedSet]);

  const visibleProjects = useMemo(() => {
    if (!hasLocks) return data.projects;
    return data.projects.filter((p) => (barsByProject.get(p.id)?.length ?? 0) > 0);
  }, [data.projects, barsByProject, hasLocks]);

  const projectsForDisplay = useMemo(() => {
    if (!hasLocks) return visibleProjects;
    return visibleProjects.map((project) => {
      const bars = barsByProject.get(project.id) ?? [];
      return {
        ...project,
        periodEffectiveDays: bars.reduce((sum, bar) => sum + bar.effectiveDays, 0),
        periodStaffCount: new Set(bars.map((bar) => bar.userId)).size,
        periodCost: bars.reduce((sum, bar) => sum + bar.cost, 0),
      };
    });
  }, [visibleProjects, barsByProject, hasLocks]);

  const detailProjects = useMemo(() => {
    if (projectScope === ALL_PROJECTS) return visibleProjects;
    const project = visibleProjects.find((p) => p.id === projectScope);
    return project ? [project] : visibleProjects;
  }, [visibleProjects, projectScope]);

  const projectOptions = useMemo(
    () => [
      { value: ALL_PROJECTS, label: "全部项目" },
      ...visibleProjects.map((p) => ({
        value: p.id,
        label: `${p.name}（${p.customerName}）`,
      })),
    ],
    [visibleProjects]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function hrefFor(overrides: {
    view?: ScheduleModuleView;
    project?: ScheduleProjectScope | null;
    lock?: string[] | null;
    range?: SchedulePeriod["mode"];
    start?: string;
    period?: SchedulePeriod;
  }) {
    const nextLock =
      overrides.lock !== undefined ? overrides.lock : lockedPersonIds;

    const nextPeriod = overrides.period ?? period;

    let nextProject: ScheduleProjectScope | undefined;
    if (overrides.project === null) {
      nextProject = undefined;
    } else if (overrides.project !== undefined) {
      nextProject = overrides.project;
    } else if ((overrides.view ?? view) === "detail") {
      nextProject = projectScope;
    }

    return buildScheduleModuleHref({
      range: overrides.range ?? nextPeriod.mode,
      start: overrides.start ?? periodStartKey(nextPeriod),
      view: overrides.view ?? view,
      project: nextProject,
      lock: nextLock,
    });
  }

  function navigate(params: Parameters<typeof hrefFor>[0]) {
    router.push(hrefFor(params));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveStaff(null);
    const { active, over } = event;
    if (!over || !canEdit || view !== "detail") return;

    const userId =
      active.data.current?.type === "staff"
        ? (active.data.current.userId as string)
        : String(active.id).replace("staff-", "");

    const dropType = over.data.current?.type;
    let targetProjectId: string | undefined;

    if (dropType === "project-add") {
      targetProjectId = over.data.current?.projectId as string | undefined;
    } else if (dropType === "timeline-row") {
      const targetUserId = over.data.current?.userId as string | undefined;
      targetProjectId = over.data.current?.projectId as string | undefined;
      if (!targetProjectId || !targetUserId) return;
      if (targetUserId !== userId) {
        setError("请拖到对应人员的时间轴行");
        return;
      }
    } else {
      return;
    }

    if (!targetProjectId) return;

    const { startDate, endDate } = datesFromPeriodDrop(period);
    setError(null);
    startTransition(async () => {
      const result = await createProjectAllocationFromDrag({
        projectId: targetProjectId,
        userId,
        startDate,
        endDate,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function toggleLock(personId: string) {
    const next = new Set(lockedPersonIds);
    if (next.has(personId)) next.delete(personId);
    else next.add(personId);
    navigate({ lock: [...next] });
  }

  function renderProjectGantt(project: (typeof data.projects)[number]) {
    const projectBars = barsByProject.get(project.id) ?? [];
    const staffRows = data.staff.filter((member) => {
      const hasBars = projectBars.some((b) => b.userId === member.id);
      if (!hasBars) return false;
      if (hasLocks) return lockedSet.has(member.id);
      return true;
    });

    return (
      <div key={project.id} className="border-b-2 border-muted">
        {projectScope === ALL_PROJECTS ? (
          <div
            className="sticky left-0 z-10 flex border-b bg-muted/50 px-4 py-2 text-sm"
            style={{ minWidth: days.length * dayWidth + ROW_LABEL_WIDTH }}
          >
            <p className="font-semibold">{project.name}</p>
            <span className="mx-2 text-muted-foreground">·</span>
            <p className="text-muted-foreground">{project.customerName}</p>
            {project.periodEffectiveDays > 0 ? (
              <span className="ml-auto text-xs text-muted-foreground">
                {project.periodEffectiveDays} 人天
              </span>
            ) : null}
          </div>
        ) : null}

        {staffRows.length === 0 && !canEdit ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">该时段暂无投入</p>
        ) : (
          staffRows.map((member) => {
            const bars = projectBars.filter((b) => b.userId === member.id);
            return (
              <ScheduleTimelineRow
                key={`${project.id}-${member.id}`}
                rowId={`project-row-${project.id}-${member.id}`}
                periodStart={period.from}
                days={days}
                dayWidth={dayWidth}
                rowLabelWidth={ROW_LABEL_WIDTH}
                label={member.name}
                sublabel={`${bars.reduce((s, b) => s + b.effectiveDays, 0)} 人天`}
                bars={bars}
                showProject={false}
                canDrop={canEdit}
                highlighted={lockedSet.has(member.id)}
                highlightUserIds={hasLocks ? lockedPersonIds : undefined}
                onSelectBar={setSelectedBar}
                dropTarget={{ projectId: project.id, userId: member.id }}
              />
            );
          })
        )}

        {canEdit ? (
          <ScheduleTimelineAddRow
            rowId={`project-add-${project.id}`}
            projectId={project.id}
            days={days}
            dayWidth={dayWidth}
            rowLabelWidth={ROW_LABEL_WIDTH}
            canDrop={canEdit}
          />
        ) : null}
      </div>
    );
  }

  const peerRecordsForSelected = selectedBar
    ? peerRecordsByUser[selectedBar.userId] ?? []
    : [];

  const prevPeriod = shiftPeriod(period, -1);
  const nextPeriod = shiftPeriod(period, 1);

  return (
    <div className="flex h-full flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor({ period: prevPeriod })}>
              {period.mode === "month" ? "上一月" : "上一周"}
            </Link>
          </Button>
          <span className="text-sm font-medium whitespace-nowrap">
            {formatPeriodLabel(period)}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor({ period: nextPeriod })}>
              {period.mode === "month" ? "下一月" : "下一周"}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-1 gap-1">
            <Link
              href={hrefFor({ range: "month", start: periodKey })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period.mode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              按月
            </Link>
            <Link
              href={hrefFor({ range: "week", start: periodKey })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period.mode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              按周
            </Link>
          </div>

          <div className="flex rounded-lg border p-1 gap-1">
            <Link
              href={hrefFor({ view: "global", project: null })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === "global"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              全局总览
            </Link>
            <Link
              href={hrefFor({ view: "detail", project: projectScope })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === "detail"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              资源明细
            </Link>
          </div>
        </div>
      </div>

      {hasLocks ? (
        <p className="text-xs text-muted-foreground shrink-0">
          已锁定 {lockedPersonIds.length} 人：
          <span className="font-medium text-foreground">
            {lockedPersonIds
              .map((id) => data.staff.find((s) => s.id === id)?.name ?? "未知")
              .join("、")}
          </span>
          ，仅显示其相关排班
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive shrink-0">{error}</p> : null}
      {pending ? (
        <p className="text-sm text-muted-foreground shrink-0">保存中…</p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          const id = String(e.active.id).replace("staff-", "");
          setActiveStaff(data.staff.find((s) => s.id === id) ?? null);
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveStaff(null)}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="w-80 shrink-0">
            <ScheduleStaffPanel
              staff={data.staff}
              lockedPersonIds={lockedPersonIds}
              onToggleLock={toggleLock}
              onClearLocks={() => navigate({ lock: [] })}
              canDrag={canEdit && view === "detail" && detailProjects.length > 0}
              periodLabel={periodLabel}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {view === "global" ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="sticky top-0 z-10 border-b bg-card px-4 py-3">
                  <p className="text-sm font-medium">项目总览</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    点击项目卡片进入资源明细；{periodLabel}投入与人员统计见卡片内
                  </p>
                </div>
                <ScheduleProjectCards
                  projects={projectsForDisplay}
                  periodLabel={periodLabel}
                  onSelectProject={(projectId) =>
                    navigate({ view: "detail", project: projectId })
                  }
                />
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b p-4">
                  {visibleProjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无可见项目</p>
                  ) : (
                    <SelectField
                      id="schedule-project"
                      name="project"
                      label="项目范围"
                      value={projectScope === ALL_PROJECTS ? ALL_PROJECTS : projectScope}
                      onValueChange={(id) => navigate({ project: id })}
                      options={projectOptions}
                    />
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    仅显示已有投入的人员；新人员请拖到各行下方的「添加投入」区域
                    {period.mode === "month" ? "（默认当前周工作日）" : ""}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {detailProjects.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      暂无可见项目
                    </p>
                  ) : (
                    <>
                      <ScheduleTimelineHeader
                        days={days}
                        rowLabel="人员"
                        dayWidth={dayWidth}
                        rowLabelWidth={ROW_LABEL_WIDTH}
                      />
                      {detailProjects.map((project) => renderProjectGantt(project))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeStaff ? (
            <div className="rounded-lg border bg-card p-3 text-sm shadow-xl w-44">
              <p className="font-medium">{activeStaff.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedBar ? (
        <AllocationEditDialog
          bar={selectedBar}
          projectId={selectedBar.projectId}
          canEdit={canEdit}
          peerRecords={peerRecordsForSelected}
          onClose={() => setSelectedBar(null)}
          onDeleted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
