"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  SCHEDULE_CUSTOM_MAX_DAYS,
  buildScheduleModuleHref,
  buildTimelineDays,
  customRangeFromProjectDates,
  defaultAllocationDates,
  fitScheduleDayWidth,
  formatAllocationPersonDaysSummary,
  formatPeriodLabel,
  formatPersonDays,
  periodEndKey,
  periodRangeSwitchEnd,
  periodRangeSwitchStart,
  periodStartKey,
  shiftPeriod,
  type ScheduleDetailAxis,
  type ScheduleModuleView,
  type SchedulePeriod,
  type ScheduleProjectIds,
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
import { ScheduleProjectMultiSelect } from "@/components/projects/schedule-project-multi-select";
import {
  ScheduleTimelineHeader,
  ScheduleTimelineRow,
  ScheduleTimelineAddRow,
} from "@/components/projects/schedule-timeline";
import { AllocationEditDialog } from "@/components/projects/allocation-edit-dialog";
import { findOverlappingSegment } from "@/lib/projects/allocation-overlap";
import { peekScheduleReturn, saveScheduleReturn } from "@/lib/projects/task-form-draft";

const ROW_LABEL_WIDTH = 160;
const PROJECT_COL_WIDTH = 168;

type Props = {
  data: ScheduleModuleData;
  canEdit: boolean;
  view: ScheduleModuleView;
  axis: ScheduleDetailAxis;
  selectedProjectIds: ScheduleProjectIds;
  lockedPersonIds: string[];
  peerRecordsByUser: Record<string, AllocationRecord[]>;
};

export function ScheduleModule({
  data,
  canEdit,
  view,
  axis,
  selectedProjectIds,
  lockedPersonIds,
  peerRecordsByUser,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTaskFromUrl = searchParams.get("returnTask")?.trim() || null;
  const [returnTask, setReturnTask] = useState(returnTaskFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [activeStaff, setActiveStaff] = useState<ScheduleStaff | null>(null);
  const [selectedBar, setSelectedBar] = useState<ScheduleBar | null>(null);
  const [draftSegment, setDraftSegment] = useState<{ startDate: string; endDate: string } | null>(
    null
  );

  useEffect(() => {
    const projectId =
      selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;
    if (returnTaskFromUrl) {
      setReturnTask(returnTaskFromUrl);
      if (projectId) saveScheduleReturn(projectId, returnTaskFromUrl);
      return;
    }
    if (projectId) {
      const stored = peekScheduleReturn(projectId);
      if (stored) setReturnTask(stored);
    }
  }, [returnTaskFromUrl, selectedProjectIds]);

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
  const timelinePaneRef = useRef<HTMLDivElement>(null);
  const [timelinePaneWidth, setTimelinePaneWidth] = useState(0);
  const sideLabelWidth = axis === "person" ? PROJECT_COL_WIDTH : ROW_LABEL_WIDTH;

  useEffect(() => {
    const el = timelinePaneRef.current;
    if (!el) return;
    const update = () => setTimelinePaneWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const dayWidth = fitScheduleDayWidth({
    period,
    dayCount: days.length,
    containerWidth: timelinePaneWidth,
    sideLabelWidth,
  });
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

  const barsByUser = useMemo(() => {
    const map = new Map<string, ScheduleBar[]>();
    for (const bar of data.allBars) {
      if (hasLocks && !lockedSet.has(bar.userId)) continue;
      const list = map.get(bar.userId) ?? [];
      list.push(bar);
      map.set(bar.userId, list);
    }
    return map;
  }, [data.allBars, hasLocks, lockedSet]);

  const selectedProjectSet = useMemo(
    () => new Set(selectedProjectIds),
    [selectedProjectIds]
  );
  const isAllProjects = selectedProjectIds.length === 0;

  const visibleProjects = useMemo(() => {
    if (!hasLocks) return data.projects;
    const withBars = data.projects.filter((p) => (barsByProject.get(p.id)?.length ?? 0) > 0);
    // 当前选中的项目即使尚无锁定人员投入也保留，便于继续拖入排班
    const extras = data.projects.filter(
      (p) => selectedProjectSet.has(p.id) && !withBars.some((w) => w.id === p.id)
    );
    return [...withBars, ...extras];
  }, [data.projects, barsByProject, hasLocks, selectedProjectSet]);

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
    if (isAllProjects) return visibleProjects;
    const fromVisible = visibleProjects.filter((p) => selectedProjectSet.has(p.id));
    const missing = data.projects.filter(
      (p) => selectedProjectSet.has(p.id) && !fromVisible.some((v) => v.id === p.id)
    );
    return [...fromVisible, ...missing];
  }, [visibleProjects, isAllProjects, selectedProjectSet, data.projects]);

  const detailProjectIdSet = useMemo(
    () => new Set(detailProjects.map((p) => p.id)),
    [detailProjects]
  );

  const detailPeople = useMemo(() => {
    if (hasLocks) return data.staff.filter((s) => lockedSet.has(s.id));
    return data.staff.filter((s) => {
      const bars = barsByUser.get(s.id) ?? [];
      return bars.some((b) => detailProjectIdSet.has(b.projectId));
    });
  }, [data.staff, barsByUser, hasLocks, lockedSet, detailProjectIdSet]);

  const projectOptions = useMemo(
    () =>
      data.projects.map((p) => ({
        value: p.id,
        label: `${p.name}（${p.customerName}）`,
      })),
    [data.projects]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const dndContextId = useId();

  function hrefFor(overrides: {
    view?: ScheduleModuleView;
    axis?: ScheduleDetailAxis;
    project?: ScheduleProjectIds | null;
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
    const nextAxis = overrides.axis ?? axis;

    let nextProject: ScheduleProjectIds | undefined;
    if (overrides.project === null) {
      nextProject = [];
    } else if (overrides.project !== undefined) {
      nextProject = overrides.project;
    } else if ((overrides.view ?? view) === "detail") {
      nextProject = selectedProjectIds;
    }

    return buildScheduleModuleHref({
      range: nextRange,
      start: overrides.start ?? periodStartKey(nextPeriod),
      end:
        nextRange === "custom"
          ? overrides.end ?? periodEndKey(nextPeriod)
          : undefined,
      view: overrides.view ?? view,
      axis: nextAxis,
      project: nextProject,
      lock: nextLock,
      returnTask,
    });
  }

  function navigate(params: Parameters<typeof hrefFor>[0]) {
    router.push(hrefFor(params));
  }

  function applyProjectFilter(ids: ScheduleProjectIds) {
    const next: Parameters<typeof hrefFor>[0] = {
      project: ids,
      axis,
    };

    // 仅选中一个项目且当前为自定义周期时，按该项目起止拉长区间
    if (ids.length === 1 && period.mode === "custom") {
      const project = data.projects.find((p) => p.id === ids[0]);
      const span = project
        ? customRangeFromProjectDates({
            plannedStartAt: project.plannedStartAt,
            plannedEndAt: project.plannedEndAt,
            actualStartAt: project.actualStartAt,
            actualEndAt: project.actualEndAt,
          })
        : null;
      if (span) {
        next.range = "custom";
        next.start = span.start;
        next.end = span.end;
        setError(null);
      }
    }

    navigate(next);
  }

  /** 从总览卡片进入某一项目明细 */
  function navigateToProject(
    projectId: string,
    extras: Parameters<typeof hrefFor>[0] = {}
  ) {
    const next: Parameters<typeof hrefFor>[0] = {
      ...extras,
      project: [projectId],
      view: extras.view ?? "detail",
    };

    const useCustom =
      (extras.range ?? period.mode) === "custom" || extras.view === "detail";

    if (useCustom) {
      const project = data.projects.find((p) => p.id === projectId);
      const span = project
        ? customRangeFromProjectDates({
            plannedStartAt: project.plannedStartAt,
            plannedEndAt: project.plannedEndAt,
            actualStartAt: project.actualStartAt,
            actualEndAt: project.actualEndAt,
          })
        : null;
      if (span) {
        next.range = "custom";
        next.start = span.start;
        next.end = span.end;
        setError(null);
      }
    }

    navigate(next);
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
      setError(`自定义周期最长约 3 年（${SCHEDULE_CUSTOM_MAX_DAYS} 天），已自动截断`);
    } else {
      setError(null);
    }
    navigate({ range: "custom", start, end });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveStaff(null);
    const { active, over } = event;
    if (!over || !canEdit || view !== "detail" || axis !== "project") return;

    const userId =
      active.data.current?.type === "staff"
        ? (active.data.current.userId as string)
        : String(active.id).replace("staff-", "");

    if (hasLocks && !lockedSet.has(userId)) {
      setError("当前已锁定人员，请先解除锁定或只拖动已锁定人员");
      return;
    }

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

    const project = data.projects.find((item) => item.id === targetProjectId);
    const { startDate, endDate } = defaultAllocationDates(
      project
        ? {
            plannedStartAt: project.plannedStartAt,
            plannedEndAt: project.plannedEndAt,
            actualStartAt: project.actualStartAt,
            actualEndAt: project.actualEndAt,
          }
        : null
    );
    const projectBars = data.allocationSegments.filter(
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
      if (hasLocks) {
        // 锁定人员即使本项目尚无投入也显示空行，便于拖入
        return lockedSet.has(member.id);
      }
      return projectBars.some((b) => b.userId === member.id);
    });

    return (
      <div key={project.id} className="border-b-2 border-muted">
        {isAllProjects || selectedProjectIds.length > 1 ? (
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
            hint=""
          />
        ) : null}
      </div>
    );
  }

  function renderPersonGantt(member: ScheduleStaff) {
    const userBars = barsByUser.get(member.id) ?? [];
    const projectIdsWithBars = new Set(userBars.map((b) => b.projectId));
    // 人员维度只读展示已有投入，不提供拖入空行
    const projectRows = detailProjects.filter((p) => projectIdsWithBars.has(p.id));

    return (
      <div key={member.id} className="border-b-2 border-muted">
        <div
          className="sticky left-0 z-10 flex border-b bg-muted/50 px-4 py-2 text-sm"
          style={{ minWidth: days.length * dayWidth + PROJECT_COL_WIDTH }}
        >
          <p className="font-semibold">{member.name}</p>
          {userBars.length > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {formatPersonDays(
                userBars
                  .filter((b) => detailProjectIdSet.has(b.projectId))
                  .reduce((sum, bar) => sum + bar.effectiveDays, 0)
              )}{" "}
              人天 ·{" "}
              {
                new Set(
                  userBars
                    .filter((b) => detailProjectIdSet.has(b.projectId))
                    .map((b) => b.projectId)
                ).size
              }{" "}
              项目
            </span>
          ) : null}
        </div>

        {projectRows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">该时段暂无投入</p>
        ) : (
          projectRows.map((project) => {
            const bars = userBars.filter((b) => b.projectId === project.id);
            return (
              <ScheduleTimelineRow
                key={`${member.id}-${project.id}`}
                rowId={`person-row-${member.id}-${project.id}`}
                periodStart={period.from}
                days={days}
                dayWidth={dayWidth}
                rowLabelWidth={PROJECT_COL_WIDTH}
                label={project.name}
                sublabel={formatAllocationPersonDaysSummary(bars, period)}
                bars={bars}
                showProject={false}
                peerRecords={peerRecordsByUser[member.id] ?? []}
                canDrop={false}
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
        "min-w-0 max-w-[70%] shrink text-[11px] leading-[16px] rounded border px-2 py-1 truncate",
        hasLocks
          ? "text-muted-foreground border-primary/20 bg-primary/5"
          : "opacity-0 border-transparent pointer-events-none"
      )}
      title={hasLocks ? `已锁定 ${lockedPersonIds.length} 人：${lockedNames}，仅显示其相关排班` : undefined}
      aria-hidden={!hasLocks}
    >
      {hasLocks ? `已锁定 ${lockedPersonIds.length} 人：${lockedNames}` : null}
    </p>
  );

  return (
    <div className="flex h-full flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href={hrefFor({ period: prevPeriod })}>
              {period.mode === "month"
                ? "上一月"
                : period.mode === "week"
                  ? "上一周"
                  : "上一段"}
            </Link>
          </Button>
          {period.mode === "custom" ? (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                className="h-8 w-[132px]"
                value={formatLocalDateInput(period.from)}
                onChange={(e) =>
                  applyCustomRange(e.target.value, formatLocalDateInput(period.to))
                }
              />
              <span className="text-xs text-muted-foreground">至</span>
              <Input
                type="date"
                className="h-8 w-[132px]"
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
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href={hrefFor({ period: nextPeriod })}>
              {period.mode === "month"
                ? "下一月"
                : period.mode === "week"
                  ? "下一周"
                  : "下一段"}
            </Link>
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {view === "detail" ? (
            <>
              <div className="min-w-[160px] max-w-[280px] flex-1">
                <ScheduleProjectMultiSelect
                  id="schedule-project"
                  compact
                  options={projectOptions}
                  value={selectedProjectIds}
                  onChange={applyProjectFilter}
                />
              </div>
              <div className="flex h-8 items-center rounded-md border p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    navigate({ axis: "project", project: selectedProjectIds })
                  }
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    axis === "project"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  项目
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate({ axis: "person", project: selectedProjectIds })
                  }
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    axis === "person"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  人员
                </button>
              </div>
              {lockNoticeSlot}
            </>
          ) : null}
          <div className="flex rounded-md border p-0.5 gap-0.5">
            <Link
              href={hrefFor({
                range: "month",
                start: periodRangeSwitchStart(period, "month"),
              })}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
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
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                period.mode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              按周
            </Link>
            <Link
              href={(() => {
                const start = periodRangeSwitchStart(period, "custom");
                const end = periodRangeSwitchEnd(period);
                if (selectedProjectIds.length === 1) {
                  const project = data.projects.find((p) => p.id === selectedProjectIds[0]);
                  const span = project
                    ? customRangeFromProjectDates({
                        plannedStartAt: project.plannedStartAt,
                        plannedEndAt: project.plannedEndAt,
                        actualStartAt: project.actualStartAt,
                        actualEndAt: project.actualEndAt,
                      })
                    : null;
                  if (span) {
                    return hrefFor({
                      range: "custom",
                      start: span.start,
                      end: span.end,
                      project: selectedProjectIds,
                    });
                  }
                }
                return hrefFor({ range: "custom", start, end });
              })()}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                period.mode === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              自定义
            </Link>
          </div>

          <div className="flex rounded-md border p-0.5 gap-0.5">
            <Link
              href={hrefFor({ view: "global", project: null })}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "global"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              全局总览
            </Link>
            <Link
              href={hrefFor({ view: "detail", project: selectedProjectIds })}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
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
        id={dndContextId}
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
              canDrag={
                canEdit &&
                view === "detail" &&
                axis === "project" &&
                detailProjects.length > 0
              }
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
                    navigateToProject(projectId, { view: "detail" })
                  }
                />
              </div>
            ) : (
              <div ref={timelinePaneRef} className="min-h-0 flex-1 overflow-auto">
                  {axis === "project" ? (
                    detailProjects.length === 0 ? (
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
                    )
                  ) : detailProjects.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      暂无可见项目
                    </p>
                  ) : detailPeople.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      暂无可见人员（可用左侧锁定筛选）
                    </p>
                  ) : (
                    <>
                      <ScheduleTimelineHeader
                        days={days}
                        rowLabel="项目"
                        dayWidth={dayWidth}
                        rowLabelWidth={PROJECT_COL_WIDTH}
                      />
                      {detailPeople.map((member) => renderPersonGantt(member))}
                    </>
                  )}
              </div>
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
          projectSegments={data.allocationSegments.filter(
            (b) => b.userId === selectedBar.userId && b.projectId === selectedBar.projectId
          )}
          canEdit={canEdit}
          peerRecords={peerRecordsForSelected}
          draftSegment={draftSegment}
          projectDates={
            data.projects.find((p) => p.id === selectedBar.projectId) ?? null
          }
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
