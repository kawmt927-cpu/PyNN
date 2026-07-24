import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ScheduleModule } from "@/components/projects/schedule-module";
import { SchedulePlanBackLink } from "@/components/projects/schedule-plan-back-link";
import {
  parseSchedulePeriod,
  parseScheduleView,
  parseScheduleProjectIds,
  parseScheduleDetailAxis,
  parseScheduleLocks,
} from "@/lib/projects/timeline";
import {
  getScheduleModuleData,
  buildPeerRecordsMap,
} from "@/lib/projects/schedule-serialize";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
    week?: string;
    view?: string;
    axis?: string;
    project?: string;
    lock?: string;
    returnTask?: string;
  }>;
};

export default async function SchedulePage({ searchParams }: Props) {
  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
  ]);

  const params = await searchParams;
  const period = parseSchedulePeriod({
    range: params.range,
    start: params.start,
    end: params.end,
    week: params.week,
  });
  const view = parseScheduleView(params.view);
  const axis = parseScheduleDetailAxis(params.axis);

  const data = await getScheduleModuleData(
    session.user.role,
    session.user.id,
    period
  );

  const lockedPersonIds = parseScheduleLocks(
    params.lock,
    data.staff.map((s) => s.id)
  );

  const selectedProjectIds = parseScheduleProjectIds(
    params.project,
    data.projects.map((p) => p.id)
  );

  const userIds = data.staff.map((s) => s.id);
  const peerRaw =
    userIds.length > 0
      ? await prisma.projectStaffAllocation.findMany({
          where: { userId: { in: userIds } },
        })
      : [];
  const peerRecordsByUser = buildPeerRecordsMap(peerRaw);

  const canEdit =
    session.user.role === "ADMIN" ||
    session.user.role === "PROJECT_ADMIN" ||
    session.user.role === "PROJECT_MANAGER";

  const planProjectId =
    typeof params.project === "string" &&
    params.project.length > 0 &&
    !params.project.includes(",")
      ? params.project
      : selectedProjectIds.length === 1
        ? selectedProjectIds[0]
        : null;

  const returnTaskId = params.returnTask?.trim() || null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
        <div className="flex items-center gap-4">
          {planProjectId ? (
            <SchedulePlanBackLink projectId={planProjectId} returnTaskFromUrl={returnTaskId} />
          ) : (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/projects">返回项目列表</Link>
            </Button>
          )}
          <h1 className="text-base font-semibold">资源排班</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {planProjectId ? (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/projects">返回项目列表</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">加载排班…</div>}>
          <ScheduleModule
            data={data}
            canEdit={canEdit}
            view={view}
            axis={axis}
            selectedProjectIds={selectedProjectIds}
            lockedPersonIds={lockedPersonIds}
            peerRecordsByUser={peerRecordsByUser}
          />
        </Suspense>
      </div>
    </div>
  );
}
