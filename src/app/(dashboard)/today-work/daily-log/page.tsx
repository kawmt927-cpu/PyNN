import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTodayLogDate } from "@/lib/sales-log/daily-log";
import { isDailyReportSubmitted } from "@/lib/sales-log/daily-report-submission";
import { DAILY_REPORT_DEADLINE_HOUR } from "@/lib/sales-log/daily-report-submission";
import { BackLink } from "@/components/navigation/back-link";
import { SalesLogAiChat } from "@/components/sales-log/sales-log-ai-chat";

export default async function TodayWorkDailyLogPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const logDate = getTodayLogDate();
  const log = await prisma.salesDailyLog.findUnique({
    where: { userId_logDate: { userId: session.user.id, logDate } },
    select: { status: true, lateMarkedAt: true },
  });
  const showLateMakeup =
    Boolean(log?.lateMarkedAt) && (!log || !isDailyReportSubmitted(log.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">今日日报 · AI 助理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            在 PC 端与 AI 对话整理日报，确认后写入今日工作。定位打卡请使用「往来打卡」。
          </p>
        </div>
        <BackLink href="/today-work" label="返回今日工作" />
      </div>

      {showLateMakeup ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100">
          <p className="font-medium">日报已超时，系统已记录一次迟交</p>
          <p className="mt-1">
            截止时间为当日 {DAILY_REPORT_DEADLINE_HOUR}:00。请在此补录；补录后会正常生成记录，迟交统计不会取消。
          </p>
        </div>
      ) : null}

      <div className="h-[min(75vh,780px)] overflow-hidden rounded-xl border bg-card shadow-sm">
        <SalesLogAiChat
          enableLocationAssist={false}
          title="AI 日报助理"
          subtitle="描述今日拜访与工作进展，助理将整理成日报"
        />
      </div>
    </div>
  );
}
