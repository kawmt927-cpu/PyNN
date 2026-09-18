import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ScheduleModule } from "@/components/projects/schedule-module";
import {
  parseSchedulePeriod,
  customRangeFromProjectDates,
} from "@/lib/projects/timeline";
import {
  getScheduleModuleData,
  buildPeerRecordsMap,
  type ScheduleModuleData,
} from "@/lib/projects/schedule-serialize";
import type { UserRole } from "@prisma/client";

type Query = {
  range?: string;
  start?: string;
  end?: string;
  week?: string;
  axis?: string;
};

type Props = {
  projectId: string;
  role: UserRole;
  userId: string;
  canEdit: boolean;
  query: Query;
};

function scopeDataToProject(
  data: ScheduleModuleData,
  projectId: string
): ScheduleModuleData {
  const projects = data.projects.filter((p) => p.id === projectId);
  const project = projects[0];
  const allocatedIds = new Set(project?.allocatedStaff.map((s) => s.userId) ?? []);
  const resignedByUser = new Map(
    (project?.allocatedStaff ?? []).map((s) => [s.userId, s.resigned])
  );

  // 甘特行：本项目已排班人员（含离职）；资源池仍用全量可排班人员
  let staff =
    allocatedIds.size > 0
      ? data.staff
          .filter((s) => allocatedIds.has(s.id))
          .map((s) =>
            resignedByUser.get(s.id)
              ? {
                  ...s,
                  resigned: true,
                  hidePeriodMetrics:
                    s.hidePeriodMetrics ||
                    (s.weekEffectiveDays <= 0 && s.parallelProjects <= 0),
                }
              : s
          )
      : data.staff;

  // 离职且不在可排班列表中的人，补进甘特人员行
  const missing = (project?.allocatedStaff ?? []).filter(
    (s) => !staff.some((row) => row.id === s.userId)
  );
  if (missing.length > 0) {
    staff = [
      ...staff,
      ...missing.map((s) => ({
        id: s.userId,
        name: s.name,
        dailyRate: null,
        personnelType: null,
        weekEffectiveDays: 0,
        parallelProjects: 0,
        weekLoadPercent: 0,
        resigned: s.resigned,
        hidePeriodMetrics: s.resigned,
        activeProjectNames: [],
      })),
    ];
  }

  return {
    ...data,
    projects,
    staff,
    poolStaff: data.poolStaff,
    allBars: data.allBars.filter((b) => b.projectId === projectId),
    allocationSegments: data.allocationSegments.filter(
      (b) => b.projectId === projectId
    ),
    globalRows: data.globalRows
      .map((row) => ({
        ...row,
        bars: row.bars.filter((b) => b.projectId === projectId),
      }))
      .filter((row) => row.bars.length > 0)
      .map((row) => {
        const weekEffectiveDays = row.bars.reduce(
          (sum, bar) => sum + bar.effectiveDays,
          0
        );
        const weekCost = row.bars.reduce((sum, bar) => sum + bar.cost, 0);
        return {
          ...row,
          weekEffectiveDays,
          weekCost,
        };
      }),
  };
}

export async function ProjectScheduleEmbed({
  projectId,
  role,
  userId,
  canEdit,
  query,
}: Props) {
  const hasExplicitRange = Boolean(
    query.range || query.start || query.end || query.week
  );

  let period = parseSchedulePeriod({
    range: query.range,
    start: query.start,
    end: query.end,
    week: query.week,
  });

  let data = await getScheduleModuleData(role, userId, period);
  data = scopeDataToProject(data, projectId);

  const project = data.projects[0];
  if (!hasExplicitRange && project) {
    const span = customRangeFromProjectDates({
      plannedStartAt: project.plannedStartAt,
      plannedEndAt: project.plannedEndAt,
      actualStartAt: project.actualStartAt,
      actualEndAt: project.actualEndAt,
      allocationSpanStart: project.allocationSpanStart,
      allocationSpanEnd: project.allocationSpanEnd,
    });
    if (span) {
      period = parseSchedulePeriod({
        range: "custom",
        start: span.start,
        end: span.end,
      });
      data = scopeDataToProject(
        await getScheduleModuleData(role, userId, period),
        projectId
      );
    }
  }

  if (!data.projects.some((p) => p.id === projectId)) {
    return (
      <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        无法加载该项目的排班数据，或你没有查看权限。
      </p>
    );
  }

  const userIds = [
    ...new Set([
      ...data.staff.map((s) => s.id),
      ...data.poolStaff.map((s) => s.id),
    ]),
  ];
  const peerRaw =
    userIds.length > 0
      ? await prisma.projectStaffAllocation.findMany({
          where: { userId: { in: userIds } },
        })
      : [];
  const peerRecordsByUser = buildPeerRecordsMap(peerRaw);

  return (
    <div className="min-h-[calc(100dvh-14rem)] overflow-hidden rounded-lg border bg-card shadow-sm">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-muted-foreground">加载排班…</div>
        }
      >
        <ScheduleModule
          data={data}
          canEdit={canEdit}
          view="detail"
          axis="project"
          selectedProjectIds={[projectId]}
          peerRecordsByUser={peerRecordsByUser}
          embedProjectId={projectId}
        />
      </Suspense>
    </div>
  );
}
