"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePropagateWheelAtEdgeRef } from "@/hooks/use-propagate-wheel-at-edge";
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
  buildProjectScheduleHref,
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
  scheduleFocusDatesFromFilter,
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
import {
  ScheduleStaffCard,
  STAFF_GANTT_LABEL_WIDTH,
} from "@/components/projects/schedule-staff-card";
import { ScheduleProjectCards } from "@/components/projects/schedule-project-cards";
import { ScheduleProjectMultiSelect } from "@/components/projects/schedule-project-multi-select";
import {
  ScheduleTimelineHeader,
  ScheduleTimelineRow,
  ScheduleTimelineAddRow,
  ScheduleProjectDropZone,
} from "@/components/projects/schedule-timeline";
import { AllocationEditDialog } from "@/components/projects/allocation-edit-dialog";
import { AddAllocationPickerDialog } from "@/components/projects/add-allocation-picker-dialog";
import { findOverlappingSegment } from "@/lib/projects/allocation-overlap";
import { peekScheduleReturn, saveScheduleReturn } from "@/lib/projects/task-form-draft";
import { useScheduleFullscreen } from "@/components/layout/dashboard-shell";
import { ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { StaffColorProvider } from "@/lib/projects/timeline-colors";

const ROW_LABEL_WIDTH = 160;
const PROJECT_COL_WIDTH = 168;
const STAFF_ROW_MIN_HEIGHT = 72;

type Props = {
  data: ScheduleModuleData;
  canEdit: boolean;
  view: ScheduleModuleView;
  axis: ScheduleDetailAxis;
  selectedProjectIds: ScheduleProjectIds;
  peerRecordsByUser: Record<string, AllocationRecord[]>;
  /** 全局排班人员锁定；项目详情内嵌不传 */
  lockedPersonIds?: string[];
  /** 项目详情页内嵌：锁定单项目，URL 写在 ?tab=schedule */
  embedProjectId?: string;
};

export function ScheduleModule({
  data,
  canEdit,
  view,
  axis: axisProp,
  selectedProjectIds,
  peerRecordsByUser,
  lockedPersonIds = [],
  embedProjectId,
}: Props) {
  const embedded = Boolean(embedProjectId);
  /** 项目详情内嵌排班固定按「项目」维度，不再切换人员视图 */
  const axis: ScheduleDetailAxis = embedded ? "project" : axisProp;
  const lockEnabled = !embedded;
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTaskFromUrl = embedded
    ? null
    : searchParams.get("returnTask")?.trim() || null;
  const [returnTask, setReturnTask] = useState(returnTaskFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [activeStaff, setActiveStaff] = useState<ScheduleStaff | null>(null);
  const [selectedBar, setSelectedBar] = useState<ScheduleBar | null>(null);
  const [draftSegment, setDraftSegment] = useState<{ startDate: string; endDate: string } | null>(
    null
  );
  const [addPickerProjectId, setAddPickerProjectId] = useState<string | null>(null);
  const [showResignedStaff, setShowResignedStaff] = useState(true);
  const { fullscreen, toggle: toggleFullscreen } = useScheduleFullscreen();

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
  const timelineWheelChainRef = usePropagateWheelAtEdgeRef<HTMLDivElement>();
  const globalWheelChainRef = usePropagateWheelAtEdgeRef<HTMLDivElement>();
  const [timelinePaneWidth, setTimelinePaneWidth] = useState(0);
  /** 仅项目详情内嵌排班：人员富信息卡并入甘特；全局排班始终保留左侧人员侧栏 */
  const mergeStaffIntoGantt = embedded && axis === "project";
  const personLabelWidth = mergeStaffIntoGantt
    ? STAFF_GANTT_LABEL_WIDTH
    : ROW_LABEL_WIDTH;
  const sideLabelWidth = axis === "person" ? PROJECT_COL_WIDTH : personLabelWidth;

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

  const hasLocks = lockEnabled && lockedPersonIds.length > 0;
  const lockedSet = useMemo(
    () => new Set(lockEnabled ? lockedPersonIds : []),
    [lockEnabled, lockedPersonIds]
  );

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

  function scrollTimelineToDate(dateKey: string) {
    const el = timelinePaneRef.current;
    if (!el || days.length === 0 || dayWidth <= 0) return;
    const target = parseDateOnlyInput(dateKey);
    const msPerDay = 86400000;
    let dayIndex = Math.round(
      (target.getTime() - period.from.getTime()) / msPerDay
    );
    dayIndex = Math.max(0, Math.min(days.length - 1, dayIndex));
    el.scrollTo({ left: dayIndex * dayWidth, behavior: "smooth" });
  }

  function scrollToStaffAllocationStart(userId: string, projectId: string) {
    const segments = data.allocationSegments.filter(
      (b) => b.userId === userId && b.projectId === projectId
    );
    const visible = (barsByProject.get(projectId) ?? []).filter(
      (b) => b.userId === userId
    );
    const pool = segments.length > 0 ? segments : visible;
    if (pool.length === 0) return;
    const earliest = pool.reduce(
      (min, b) => (b.startDate < min ? b.startDate : min),
      pool[0].startDate
    );
    scrollTimelineToDate(earliest);
  }

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
    return data.projects.filter((p) => {
      const bars = barsByProject.get(p.id) ?? [];
      return bars.length > 0;
    });
  }, [data.projects, barsByProject, hasLocks]);

  const projectsForDisplay = useMemo(() => {
    if (!hasLocks) return visibleProjects;
    return visibleProjects.map((p) => {
      const bars = barsByProject.get(p.id) ?? [];
      const staff = new Map(bars.map((b) => [b.userId, b.userName]));
      return {
        ...p,
        periodEffectiveDays: bars.reduce((sum, bar) => sum + bar.effectiveDays, 0),
        periodStaffCount: staff.size,
        periodCost: bars.reduce((sum, bar) => sum + bar.cost, 0),
        periodStaff: [...staff.entries()]
          .map(([userId, name]) => ({ userId, name, resigned: false as const }))
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
    return data.staff.filter((s) => {
      if (hasLocks && !lockedSet.has(s.id)) return false;
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
    const nextAxis = embedded ? "project" : overrides.axis ?? axis;

    let nextProject: ScheduleProjectIds | undefined;
    if (overrides.project === null) {
      nextProject = [];
    } else if (overrides.project !== undefined) {
      nextProject = overrides.project;
    } else if ((overrides.view ?? view) === "detail") {
      nextProject = selectedProjectIds;
    }

    if (embedProjectId) {
      return buildProjectScheduleHref(embedProjectId, {
        range: nextRange,
        start: overrides.start ?? periodStartKey(nextPeriod),
        end:
          nextRange === "custom"
            ? overrides.end ?? periodEndKey(nextPeriod)
            : undefined,
        axis: nextAxis,
      });
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
      lock: lockEnabled ? nextLock : undefined,
      returnTask,
    });
  }

  function navigate(params: Parameters<typeof hrefFor>[0]) {
    router.push(hrefFor(params));
  }

  function toggleLock(userId: string) {
    if (!lockEnabled) return;
    const next = lockedPersonIds.includes(userId)
      ? lockedPersonIds.filter((id) => id !== userId)
      : [...lockedPersonIds, userId];
    navigate({ lock: next });
  }

  function clearLocks() {
    if (!lockEnabled) return;
    navigate({ lock: [] });
  }

  function projectCustomSpan(project: (typeof data.projects)[number]) {
    return customRangeFromProjectDates({
      plannedStartAt: project.plannedStartAt,
      plannedEndAt: project.plannedEndAt,
      actualStartAt: project.actualStartAt,
      actualEndAt: project.actualEndAt,
      allocationSpanStart: project.allocationSpanStart,
      allocationSpanEnd: project.allocationSpanEnd,
    });
  }

  /** 按当前筛选项目（及锁定人员）合成：有投入的最后时段 / 自定义最大并集 */
  const focusScheduleDates = useMemo(
    () =>
      scheduleFocusDatesFromFilter({
        projects: data.projects,
        selectedProjectIds: embedded
          ? embedProjectId
            ? [embedProjectId]
            : selectedProjectIds
          : selectedProjectIds,
        lockedUserIds: hasLocks ? lockedPersonIds : [],
        allocationSegments: data.allocationSegments,
      }),
    [
      data.projects,
      data.allocationSegments,
      embedded,
      embedProjectId,
      selectedProjectIds,
      hasLocks,
      lockedPersonIds,
    ]
  );

  function applyProjectFilter(ids: ScheduleProjectIds) {
    const next: Parameters<typeof hrefFor>[0] = {
      project: ids,
      axis,
    };

    // 选中单个项目时，自动拉长到计划/排班全跨度，避免按月只看到当前重叠的少数人
    if (ids.length === 1) {
      const project = data.projects.find((p) => p.id === ids[0]);
      const span = project ? projectCustomSpan(project) : null;
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

    const project = data.projects.find((p) => p.id === projectId);
    const span = project ? projectCustomSpan(project) : null;
    if (span) {
      next.range = "custom";
      next.start = span.start;
      next.end = span.end;
      setError(null);
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
      const capped = parseDateOnlyInput(end);
      capped.setDate(capped.getDate() - (SCHEDULE_CUSTOM_MAX_DAYS - 1));
      start = formatLocalDateInput(capped);
      setError(
        `自定义周期最长约 5 年（${SCHEDULE_CUSTOM_MAX_DAYS} 天），已保留最近一段并自动截断`
      );
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
      setError("已锁定人员时，仅可拖拽已锁定人员排班");
      return;
    }

    const dropType = over.data.current?.type;
    let targetProjectId: string | undefined;

    if (
      dropType === "project-drop" ||
      dropType === "project-add" ||
      dropType === "timeline-row"
    ) {
      targetProjectId = over.data.current?.projectId as string | undefined;
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

  function renderProjectGantt(project: (typeof data.projects)[number]) {
    const projectBars = barsByProject.get(project.id) ?? [];
    const allocatedByUserId = new Map(
      project.allocatedStaff.map((s) => [s.userId, s])
    );
    const usersWithPeriodBars = new Set(projectBars.map((b) => b.userId));
    // 仅展示本周期有投入的人员；无投入不占行（可通过「添加投入」再排）
    const staffRows = data.staff
      .filter((member) => {
        if (hasLocks && !lockedSet.has(member.id)) return false;
        return usersWithPeriodBars.has(member.id);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    const missingAllocated = project.allocatedStaff.filter(
      (s) =>
        usersWithPeriodBars.has(s.userId) &&
        (!hasLocks || lockedSet.has(s.userId)) &&
        !staffRows.some((row) => row.id === s.userId)
    );

    function isResignedMember(member: ScheduleStaff) {
      return Boolean(member.resigned || allocatedByUserId.get(member.id)?.resigned);
    }

    const activeStaffRows = staffRows.filter((m) => !isResignedMember(m));
    const resignedStaffRows = staffRows.filter((m) => isResignedMember(m));
    const activeMissing = missingAllocated.filter((s) => !s.resigned);
    const resignedMissing = missingAllocated.filter((s) => s.resigned);
    const resignedCount = resignedStaffRows.length + resignedMissing.length;

    function renderStaffTimelineRow(
      member: ScheduleStaff,
      keyId: string
    ) {
      const bars = projectBars.filter((b) => b.userId === member.id);
      const summary =
        bars.length > 0
          ? formatAllocationPersonDaysSummary(bars, period)
          : "本周期无投入";
      const cardMember =
        allocatedByUserId.get(member.id)?.resigned || member.resigned
          ? { ...member, resigned: true }
          : member;
      return (
        <ScheduleTimelineRow
          key={`${project.id}-${keyId}`}
          rowId={`project-row-${project.id}-${keyId}`}
          periodStart={period.from}
          days={days}
          dayWidth={dayWidth}
          rowLabelWidth={personLabelWidth}
          label={member.name}
          sublabel={summary}
          labelContent={
            mergeStaffIntoGantt ? (
              <ScheduleStaffCard
                member={cardMember}
                summary={summary}
                periodLabel={periodLabel}
                canDrag={false}
                compact
                onActivate={
                  bars.length > 0 ||
                  data.allocationSegments.some(
                    (b) =>
                      b.userId === member.id && b.projectId === project.id
                  )
                    ? () =>
                        scrollToStaffAllocationStart(member.id, project.id)
                    : undefined
                }
              />
            ) : undefined
          }
          bars={bars}
          showProject={false}
          peerRecords={peerRecordsByUser[member.id] ?? []}
          canDrop={false}
          rowMinHeight={mergeStaffIntoGantt ? STAFF_ROW_MIN_HEIGHT : 56}
          onSelectBar={(bar) => {
            setDraftSegment(null);
            setSelectedBar(bar);
          }}
        />
      );
    }

    function renderMissingTimelineRow(member: (typeof missingAllocated)[number]) {
      const bars = projectBars.filter((b) => b.userId === member.userId);
      const summary =
        bars.length > 0
          ? formatAllocationPersonDaysSummary(bars, period)
          : "本周期无投入";
      const syntheticMember: ScheduleStaff = {
        id: member.userId,
        name: member.name,
        dailyRate: null,
        personnelType: null,
        weekEffectiveDays: 0,
        parallelProjects: 0,
        weekLoadPercent: 0,
        resigned: member.resigned,
        hidePeriodMetrics: member.resigned,
        activeProjectNames: [],
      };
      return (
        <ScheduleTimelineRow
          key={`${project.id}-${member.userId}`}
          rowId={`project-row-${project.id}-${member.userId}`}
          periodStart={period.from}
          days={days}
          dayWidth={dayWidth}
          rowLabelWidth={personLabelWidth}
          label={member.name}
          sublabel={summary}
          labelContent={
            mergeStaffIntoGantt ? (
              <ScheduleStaffCard
                member={syntheticMember}
                summary={summary}
                periodLabel={periodLabel}
                canDrag={false}
                compact
                onActivate={
                  bars.length > 0
                    ? () =>
                        scrollToStaffAllocationStart(
                          member.userId,
                          project.id
                        )
                    : undefined
                }
              />
            ) : undefined
          }
          bars={bars}
          showProject={false}
          peerRecords={peerRecordsByUser[member.userId] ?? []}
          canDrop={false}
          rowMinHeight={mergeStaffIntoGantt ? STAFF_ROW_MIN_HEIGHT : 56}
          onSelectBar={(bar) => {
            setDraftSegment(null);
            setSelectedBar(bar);
          }}
        />
      );
    }

    return (
      <ScheduleProjectDropZone
        key={project.id}
        projectId={project.id}
        canDrop={canEdit}
        className="border-b-2 border-muted"
      >
        {isAllProjects || selectedProjectIds.length > 1 ? (
          <div
            className="flex border-b bg-muted/50 text-sm"
            style={{ minWidth: days.length * dayWidth + personLabelWidth }}
          >
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-muted px-3 py-2 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]"
              style={{
                width: personLabelWidth,
                minWidth: personLabelWidth,
                maxWidth: personLabelWidth,
              }}
            >
              <p className="truncate font-semibold" title={project.name}>
                {project.name}
              </p>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-muted-foreground">
              <p className="truncate">{project.customerName}</p>
              <span className="ml-auto shrink-0 text-xs">
                {project.allocatedStaff.length} 人
                {project.periodEffectiveDays > 0
                  ? ` · 本周期 ${project.periodEffectiveDays} 人天`
                  : ""}
              </span>
            </div>
          </div>
        ) : null}

        {staffRows.length === 0 && missingAllocated.length === 0 && !canEdit ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">本周期暂无人员投入</p>
        ) : (
          <>
            {activeStaffRows.map((member) =>
              renderStaffTimelineRow(member, member.id)
            )}
            {activeMissing.map((member) => renderMissingTimelineRow(member))}
            {mergeStaffIntoGantt && resignedCount > 0 ? (
              <div className="border-t border-dashed border-border/70">
                <div
                  className="flex border-b bg-muted/30"
                  style={{ minWidth: days.length * dayWidth + personLabelWidth }}
                >
                  <button
                    type="button"
                    onClick={() => setShowResignedStaff((open) => !open)}
                    className="sticky left-0 z-10 flex items-center gap-2 border-r bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    style={{
                      width: personLabelWidth,
                      minWidth: personLabelWidth,
                      maxWidth: personLabelWidth,
                    }}
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform",
                        showResignedStaff ? "rotate-0" : "-rotate-90"
                      )}
                    />
                    <span>
                      {showResignedStaff
                        ? `收起离职人员（${resignedCount}）`
                        : `展开离职人员（${resignedCount}）`}
                    </span>
                  </button>
                  <div className="flex-1" />
                </div>
                {showResignedStaff ? (
                  <>
                    {resignedStaffRows.map((member) =>
                      renderStaffTimelineRow(member, member.id)
                    )}
                    {resignedMissing.map((member) =>
                      renderMissingTimelineRow(member)
                    )}
                  </>
                ) : null}
              </div>
            ) : (
              <>
                {resignedStaffRows.map((member) =>
                  renderStaffTimelineRow(member, member.id)
                )}
                {resignedMissing.map((member) => renderMissingTimelineRow(member))}
              </>
            )}
          </>
        )}

        {canEdit ? (
          <ScheduleTimelineAddRow
            rowId={`project-add-${project.id}`}
            projectId={project.id}
            days={days}
            dayWidth={dayWidth}
            rowLabelWidth={personLabelWidth}
            canDrop={canEdit}
            label="添加投入"
            onAddClick={() => setAddPickerProjectId(project.id)}
          />
        ) : null}
      </ScheduleProjectDropZone>
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
          className="flex border-b bg-muted/50 text-sm"
          style={{ minWidth: days.length * dayWidth + PROJECT_COL_WIDTH }}
        >
          <div
            className="sticky left-0 z-20 flex min-w-0 items-center border-r bg-muted px-4 py-2 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]"
            style={{
              width: PROJECT_COL_WIDTH,
              minWidth: PROJECT_COL_WIDTH,
              maxWidth: PROJECT_COL_WIDTH,
            }}
          >
            <p className="truncate font-semibold">{member.name}</p>
          </div>
          <div className="flex min-w-0 flex-1 items-center px-3 py-2">
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

  const addProject = addPickerProjectId
    ? data.projects.find((p) => p.id === addPickerProjectId)
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 bg-background",
        fullscreen
          ? "fixed inset-0 z-50 px-3 py-2"
          : "h-full min-h-0 px-3 py-2"
      )}
    >
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
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Input
                type="date"
                className="h-8 w-[10.5rem]"
                value={formatLocalDateInput(period.from)}
                onChange={(e) =>
                  applyCustomRange(e.target.value, formatLocalDateInput(period.to))
                }
              />
              <span className="shrink-0 text-xs text-muted-foreground">至</span>
              <Input
                type="date"
                className="h-8 w-[10.5rem]"
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
              {!embedded ? (
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
                </>
              ) : null}
            </>
          ) : null}
          <div className="flex rounded-md border p-0.5 gap-0.5">
            <Link
              href={hrefFor({
                range: "month",
                start: periodRangeSwitchStart(period, "month", focusScheduleDates),
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
                start: periodRangeSwitchStart(period, "week", focusScheduleDates),
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
              href={hrefFor({
                range: "custom",
                start: periodRangeSwitchStart(period, "custom", focusScheduleDates),
                end: periodRangeSwitchEnd(period, focusScheduleDates),
              })}
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

          {!embedded ? (
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
          ) : null}
          {(!embedded || fullscreen) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={toggleFullscreen}
              title={fullscreen ? "退出全屏（Esc）" : "全屏显示"}
            >
              {fullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  退出全屏
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  全屏
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive shrink-0">{error}</p> : null}

      <StaffColorProvider
        userIds={[
          ...data.staff.map((s) => s.id),
          ...(data.poolStaff ?? data.staff).map((s) => s.id),
          ...data.allBars.map((b) => b.userId),
          ...data.projects.flatMap((p) => p.allocatedStaff.map((s) => s.userId)),
        ]}
      >
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
          {!mergeStaffIntoGantt ? (
            <div className="w-80 shrink-0">
              <ScheduleStaffPanel
                staff={data.staff}
                canDrag={
                  canEdit &&
                  view === "detail" &&
                  axis === "project" &&
                  detailProjects.length > 0
                }
                periodLabel={periodLabel}
                lockedPersonIds={lockEnabled ? lockedPersonIds : undefined}
                onToggleLock={lockEnabled ? toggleLock : undefined}
                onClearLocks={lockEnabled ? clearLocks : undefined}
              />
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            {view === "global" ? (
              <div
                ref={globalWheelChainRef}
                className="min-h-0 flex-1 overflow-auto"
              >
                <div className="sticky top-0 z-10 border-b bg-card px-4 py-3">
                  <div className="flex h-[34px] items-center justify-between gap-3">
                    <p className="shrink-0 text-sm font-medium">{periodLabel}项目总览</p>
                    {lockEnabled && hasLocks ? (
                      <p
                        className="min-w-0 max-w-[75%] shrink truncate rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs leading-[18px] text-muted-foreground"
                        title={`已锁定 ${lockedPersonIds.length} 人：${lockedPersonIds
                          .map(
                            (id) =>
                              data.staff.find((s) => s.id === id)?.name ?? "未知"
                          )
                          .join("、")}，仅显示其相关排班`}
                      >
                        已锁定 {lockedPersonIds.length} 人：
                        {lockedPersonIds
                          .map(
                            (id) =>
                              data.staff.find((s) => s.id === id)?.name ?? "未知"
                          )
                          .join("、")}
                        ，仅显示其相关排班
                      </p>
                    ) : null}
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
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  ref={(el) => {
                    timelinePaneRef.current = el;
                    timelineWheelChainRef(el);
                  }}
                  className="min-h-0 flex-1 overflow-auto"
                >
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
                          rowLabelWidth={personLabelWidth}
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
                      暂无可见人员
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
      </StaffColorProvider>

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

      {addPickerProjectId ? (
        <AddAllocationPickerDialog
          open={Boolean(addPickerProjectId)}
          projectName={addProject?.name ?? ""}
          poolStaff={data.poolStaff ?? data.staff}
          existingUserIds={addProject?.allocatedStaff.map((s) => s.userId) ?? []}
          onClose={() => setAddPickerProjectId(null)}
          onSelect={(staff) => {
            const project = data.projects.find((p) => p.id === addPickerProjectId);
            if (!project) return;
            setAddPickerProjectId(null);
            const { startDate, endDate } = defaultAllocationDates({
              plannedStartAt: project.plannedStartAt,
              plannedEndAt: project.plannedEndAt,
              actualStartAt: project.actualStartAt,
              actualEndAt: project.actualEndAt,
            });
            setDraftSegment({ startDate, endDate });
            setSelectedBar(
              buildDraftScheduleBar({
                userId: staff.id,
                userName: staff.name,
                projectId: project.id,
                projectName: project.name,
                startDate,
                endDate,
                dailyRate: staff.dailyRate,
              })
            );
          }}
        />
      ) : null}
    </div>
  );
}
