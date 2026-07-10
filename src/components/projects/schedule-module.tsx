"use client";

import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import {
  SCHEDULE_CUSTOM_MAX_DAYS,
  buildScheduleModuleHref,
  buildTimelineDays,
  datesFromPeriodDrop,
  formatAllocationPersonDaysSummary,
  formatPeriodLabel,
  formatPersonDays,
  periodEndKey,
  periodRangeSwitchEnd,
  periodRangeSwitchStart,
  periodStartKey,
  scheduleDayWidth,
  shiftPeriod,
  type ScheduleModuleView,
  type SchedulePeriod,
  type ScheduleProjectScope,
} from "@/lib/projects/timeline";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { parseDateOnlyInput } from "@/lib/validations/project";
import type {
  ScheduleBar,
  ScheduleModuleData,
  ScheduleStaff,
} from "@/lib/projects/schedule-serialize";
import { buildDraftScheduleBar } from "@/lib/projects/schedule-serialize";
import type { AllocationRecord } from "@/lib/projects/allocation-split";
import { ScheduleStaffPanel } from "@/components/projects/schedule-staff-panel";
import { ScheduleProjectCards } from "@/components/projects/schedule-project-cards";
import {
  ScheduleTimelineHeader,
  ScheduleTimelineRow,
  ScheduleTimelineAddRow,
} from "@/components/projects/schedule-timeline";
import { AllocationEditDialog } from "@/components/projects/allocation-edit-dialog";
import { findOverlappingSegment } from "@/lib/projects/allocation-overlap";

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
  const [error, setError] = useState<string | null>(null);
  const [activeStaff, setActiveStaff] = useState<ScheduleStaff | null>(null);
  const [selectedBar, setSelectedBar] = useState<ScheduleBar | null>(null);
  const [draftSegment, setDraftSegment] = useState<{ startDate: string; endDate: string } | null>(
    null
  );

  const period: SchedulePeriod = useMemo(
    () => ({
      mode: data.period.mode,
      from: parseDateOnlyInput(data.period.from.slice(0, 10)),
      to: parseDateOnlyInput(data.period.to.slice(0, 10)),
    }),
    [data.period]
  );

  const periodKey = periodStartKey(period);
  const days = useMemo(() => buildTimelineDays(period), [period]);
  const dayWidth = scheduleDayWidth(period);
  const periodLabel =
    period.mode === "month" ? "本月" : period.mode === "week" ? "本周" : "本周期";
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
      const staff = new Map<string, string>();
      for (const bar of bars) staff.set(bar.userId, bar.userName);
      return {
        ...project,
        periodEffectiveDays: bars.reduce((sum, bar) => sum + bar.effectiveDays, 0),
        periodStaffCount: staff.size,
        periodCost: bars.reduce((sum, bar) => sum + bar.cost, 0),
        periodStaff: [...staff.entries()]
          .map(([userId, name]) => ({ userId, name }))
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
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
    end?: string;
    period?: SchedulePeriod;
  }) {
    const nextLock =
      overrides.lock !== undefined ? overrides.lock : lockedPersonIds;

    const nextPeriod = overrides.period ?? period;
    const nextRange = overrides.range ?? nextPeriod.mode;

    let nextProject: ScheduleProjectScope | undefined;
    if (overrides.project === null) {
      nextProject = undefined;
    } else if (overrides.project !== undefined) {
      nextProject = overrides.project;
    } else if ((overrides.view ?? view) === "detail") {
      nextProject = projectScope;
    }

    return buildScheduleModuleHref({
      range: nextRange,
      start: overrides.start ?? periodStartKey(nextPeriod),
      end:
        nextRange === "custom"
          ? overrides.end ?? periodEndKey(nextPeriod)
          : undefined,
      view: overrides.view ?? view,
      project: nextProject,
      lock: nextLock,
    });
  }

  function navigate(params: Parameters<typeof hrefFor>[0]) {
    router.push(hrefFor(params));
  }

  function applyCustomRange(nextStart: string, nextEnd: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextStart) || !/^\d{4}-\d{2}-\d{2}$/.test(nextEnd)) {
      return;
    }
    let start = nextStart;
    let end = nextEnd;
    if (parseDateOnlyInput(start).getTime() > parseDateOnlyInput(end).getTime()) {
      const swap = start;
      start = end;
      end = swap;
    }
    const spanDays =
      Math.round(
        (parseDateOnlyInput(end).getTime() - parseDateOnlyInput(start).getTime()) / 86400000
      ) + 1;
    if (spanDays > SCHEDULE_CUSTOM_MAX_DAYS) {
      const capped = parseDateOnlyInput(start);
      capped.setDate(capped.getDate() + SCHEDULE_CUSTOM_MAX_DAYS - 1);
      end = formatLocalDateInput(capped);
      setError(`自定义周期最长约 18 个月（${SCHEDULE_CUSTOM_MAX_DAYS} 天），已自动截断`);
    } else {
      setError(null);
    }
    navigate({ range: "custom", start, end });
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
    const projectBars = data.allBars.filter(
      (bar) => bar.userId === userId && bar.projectId === targetProjectId
    );

    setError(null);

    const overlapping = findOverlappingSegment(startDate, endDate, projectBars);
    setDraftSegment({ startDate, endDate });

    if (overlapping) {
      setSelectedBar(overlapping);
      return;
    }

    if (projectBars.length > 0) {
      setSelectedBar(projectBars[0]);
      return;
    }

    const staffMember = data.staff.find((member) => member.id === userId);
    const project = data.projects.find((item) => item.id === targetProjectId);
    if (!staffMember || !project) {
      setError("无法打开排班编辑器");
      return;
    }

    setSelectedBar(
      buildDraftScheduleBar({
        userId,
        userName: staffMember.name,
        projectId: targetProjectId,
        projectName: project.name,
        startDate,
        endDate,
        dailyRate: staffMember.dailyRate,
      })
    );
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
                sublabel={formatAllocationPersonDaysSummary(bars, period)}
                bars={bars}
                showProject={false}
                peerRecords={peerRecordsByUser[member.id] ?? []}
                canDrop={canEdit}
                highlighted={lockedSet.has(member.id)}
                highlightUserIds={hasLocks ? lockedPersonIds : undefined}
                onSelectBar={(bar) => {
                  setDraftSegment(null);
                  setSelectedBar(bar);
                }}
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

  const lockedNames = lockedPersonIds
    .map((id) => data.staff.find((s) => s.id === id)?.name ?? "未知")
    .join("、");

  const lockNoticeSlot = (
    <p
      className={cn(
        "min-w-0 max-w-[75%] shrink text-xs leading-[18px] rounded-md border px-3 py-1.5 truncate",
        hasLocks
          ? "text-muted-foreground border-primary/20 bg-primary/5"
          : "opacity-0 border-transparent pointer-events-none"
      )}
      title={hasLocks ? `已锁定 ${lockedPersonIds.length} 人：${lockedNames}，仅显示其相关排班` : undefined}
      aria-hidden={!hasLocks}
    >
      {hasLocks
        ? `已锁定 ${lockedPersonIds.length} 人：${lockedNames}，仅显示其相关排班`
        : "已锁定 0 人，仅显示其相关排班"}
    </p>
  );

  return (
    <div className="flex h-full flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor({ period: prevPeriod })}>
              {period.mode === "month"
                ? "上一月"
                : period.mode === "week"
                  ? "上一周"
                  : "上一段"}
            </Link>
          </Button>
          {period.mode === "custom" ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                className="h-8 w-[140px]"
                value={formatLocalDateInput(period.from)}
                onChange={(e) =>
                  applyCustomRange(e.target.value, formatLocalDateInput(period.to))
                }
              />
              <span className="text-sm text-muted-foreground">至</span>
              <Input
                type="date"
                className="h-8 w-[140px]"
                value={formatLocalDateInput(period.to)}
                onChange={(e) =>
                  applyCustomRange(formatLocalDateInput(period.from), e.target.value)
                }
              />
            </div>
          ) : (
            <span className="text-sm font-medium whitespace-nowrap">
              {formatPeriodLabel(period)}
            </span>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor({ period: nextPeriod })}>
              {period.mode === "month"
                ? "下一月"
                : period.mode === "week"
                  ? "下一周"
                  : "下一段"}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-1 gap-1">
            <Link
              href={hrefFor({
                range: "month",
                start: periodRangeSwitchStart(period, "month"),
              })}
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
              href={hrefFor({
                range: "week",
                start: periodRangeSwitchStart(period, "week"),
              })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period.mode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              按周
            </Link>
            <Link
              href={hrefFor({
                range: "custom",
                start: periodRangeSwitchStart(period, "custom"),
                end: periodRangeSwitchEnd(period),
              })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period.mode === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              自定义
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

      {error ? <p className="text-sm text-destructive shrink-0">{error}</p> : null}

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
                  <div className="flex h-[34px] items-center justify-between gap-3">
                    <p className="shrink-0 text-sm font-medium">项目总览</p>
                    {lockNoticeSlot}
                  </div>
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
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
                  <div className="mb-3 flex min-h-[34px] items-center justify-between gap-3">
                    <p className="shrink-0 text-sm font-medium">资源明细</p>
                    {lockNoticeSlot}
                  </div>
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
                    {period.mode === "week" ? "" : "（默认落在当前可见周内工作日）"}
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
          key={`${selectedBar.id}-${draftSegment?.startDate ?? "view"}`}
          bar={selectedBar}
          projectSegments={data.allBars.filter(
            (b) => b.userId === selectedBar.userId && b.projectId === selectedBar.projectId
          )}
          canEdit={canEdit}
          peerRecords={peerRecordsForSelected}
          draftSegment={draftSegment}
          onClose={() => {
            setDraftSegment(null);
            setSelectedBar(null);
          }}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
