import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ScheduleModule } from "@/components/projects/schedule-module";
import {
  parseSchedulePeriod,
  parseScheduleView,
  parseScheduleProjectScope,
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
    project?: string;
    lock?: string;
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

  const data = await getScheduleModuleData(
    session.user.role,
    session.user.id,
    period
  );

  const lockedPersonIds = parseScheduleLocks(
    params.lock,
    data.staff.map((s) => s.id)
  );

  const projectScope = parseScheduleProjectScope(
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

  return (
    <div className="flex h-screen flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">资源排班</h1>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            全局总览看项目卡片 · 资源明细看甘特排班
          </span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/projects">返回项目列表</Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <ScheduleModule
          data={data}
          canEdit={canEdit}
          view={view}
          projectScope={projectScope}
          lockedPersonIds={lockedPersonIds}
          peerRecordsByUser={peerRecordsByUser}
        />
      </div>
    </div>
  );
}
