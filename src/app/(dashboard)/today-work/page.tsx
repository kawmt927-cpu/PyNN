import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getEffectiveAmapConfig } from "@/lib/amap/config";
import { listTodayCheckIns, checkInRequiresFollowUp } from "@/lib/sales-log/check-in";
import { getTodayDailyLogForUser } from "@/lib/sales-log/daily-log";
import { TodayWorkCards } from "@/components/today-work/today-work-cards";
import {
  CheckInSection,
  DailyReportSection,
} from "@/components/today-work/sales-daily-section";
import { TodayPendingActionsPanel } from "@/components/today-work/today-pending-actions-panel";
import { AiLogLink } from "@/components/sales-log/daily-work-forms";

export default async function TodayWorkPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const returnPath = "/today-work";

  const [checkIns, dailyLog, amap] = await Promise.all([
    listTodayCheckIns(session.user.role, session.user.id),
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
          打卡、往来记录、待跟进与每周任务集中在此；收工后可通过 AI 助理提交日报。
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
        dailyLogStatus={dailyLog?.status ?? null}
        dailyReportActions={<AiLogLink />}
        checkInContent={
          <CheckInSection
            role={session.user.role}
            userId={session.user.id}
            mapKey={mapKey}
          />
        }
        dailyReportContent={
          <DailyReportSection
            role={session.user.role}
            userId={session.user.id}
            dailyLogStatus={dailyLog?.status ?? null}
            pendingCheckIns={pendingCheckIns}
          />
        }
      />

      <TodayPendingActionsPanel
        role={session.user.role}
        userId={session.user.id}
        returnPath={returnPath}
      />
    </div>
  );
}
