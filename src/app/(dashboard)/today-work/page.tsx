import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getEffectiveAmapConfig } from "@/lib/amap/config";
import { listTodayCheckIns, checkInRequiresFollowUp } from "@/lib/sales-log/check-in";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";
import { getTodayDailyLogForUser } from "@/lib/sales-log/daily-log";
import { TodayWorkCards } from "@/components/today-work/today-work-cards";
import { CheckInSection } from "@/components/today-work/sales-daily-section";
import { TodayUpcomingList } from "@/components/today-work/today-upcoming-list";
import { PaymentDueTeamPanel } from "@/components/contracts/payment-due-team-panel";
import { TodayWorkRecordsPanel } from "@/components/today-work/today-work-records";
import { TeamWorkActivityPanel } from "@/components/today-work/team-work-activity-panel";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";

type Props = {
  searchParams: Promise<{ activityView?: string; salesUserId?: string }>;
};

export default async function TodayWorkPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const returnPath = "/today-work";
  const query = await searchParams;
  const isManagerView = canManageWeeklyAssignments(session.user.role);

  if (isManagerView) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">今日工作</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看团队本周待办与各销售的打卡、往来、日报记录；销售管理无需本人打卡与写日报。
          </p>
        </div>

        <TodayUpcomingList
          role={session.user.role}
          userId={session.user.id}
          returnPath={returnPath}
        />

        <TeamWorkActivityPanel searchParams={query} />

        <PaymentDueTeamPanel role={session.user.role} returnPath={returnPath} />
      </div>
    );
  }

  const [checkIns, followUps, dailyLog, amap] = await Promise.all([
    listTodayCheckIns(session.user.role, session.user.id),
    listTodayFollowUps(session.user.role, session.user.id),
    getTodayDailyLogForUser(session.user.id),
    getEffectiveAmapConfig(),
  ]);

  const pendingCheckIns = checkIns.filter((row) => checkInRequiresFollowUp(row)).length;
  const mapKey = amap.jsKey;
  const amapConfigured = Boolean(amap.webServiceKey);
  const amapMapReady = Boolean(amap.jsKey);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">今日工作</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          打卡与日报；本周待办与今日全部工作记录集中在此。
        </p>
      </div>

      {!amapConfigured && (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          打卡地址解析尚未配置。请管理员前往{" "}
          <Link href="/admin/settings?tab=amap" className="font-medium underline">
            系统配置 → 打卡定位
          </Link>{" "}
          填写高德 Web 服务 Key。
        </p>
      )}
      {amapConfigured && !amapMapReady && (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          地址解析已就绪，但地图展示 Key 未配置。可在系统配置中补充 JS API Key。
        </p>
      )}

      <TodayWorkCards
        pendingCheckIns={pendingCheckIns}
        checkInCount={checkIns.length}
        todayFollowUpCount={followUps.length}
        dailyLogStatus={dailyLog?.status ?? null}
        checkInContent={
          <CheckInSection
            role={session.user.role}
            userId={session.user.id}
            mapKey={mapKey}
            geocodeReady={amapConfigured}
          />
        }
      />

      <TodayUpcomingList
        role={session.user.role}
        userId={session.user.id}
        returnPath={returnPath}
      />

      <TodayWorkRecordsPanel role={session.user.role} userId={session.user.id} />
    </div>
  );
}
