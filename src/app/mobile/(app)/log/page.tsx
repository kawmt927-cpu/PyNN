import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { getTodayLogDate } from "@/lib/sales-log/daily-log";
import {
  DAILY_REPORT_DEADLINE_HOUR,
  isDailyReportSubmitted,
} from "@/lib/sales-log/daily-report-submission";
import { SalesLogAiChat } from "@/components/sales-log/sales-log-ai-chat";

export default async function MobileLogPage() {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const logDate = getTodayLogDate();
  const log = await prisma.salesDailyLog.findUnique({
    where: { userId_logDate: { userId: session.user.id, logDate } },
    select: { status: true, lateMarkedAt: true },
  });
  const showLateMakeup =
    Boolean(log?.lateMarkedAt) && (!log || !isDailyReportSubmitted(log.status));

  return (
    <div className="flex h-full flex-col">
      {showLateMakeup ? (
        <div className="shrink-0 border-b border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
          <p className="font-medium">日报已超时，已记一次迟交</p>
          <p className="mt-1 text-xs">
            截止 {DAILY_REPORT_DEADLINE_HOUR}:00。请在此补录；补录不影响迟交统计。
          </p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <SalesLogAiChat enableLocationAssist />
      </div>
    </div>
  );
}
