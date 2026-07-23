import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MOBILE_MANAGER_ROLES } from "@/lib/mobile/sales-roles";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  dailyReportDayNavDates,
  defaultDailyReportDayDate,
  getDailyReportDayView,
  listDailyReportMarkedDates,
  parseDailyReportDayParams,
  resolveDailyReportSubjectUser,
} from "@/lib/sales-log/daily-report-day";
import { formatDailyReportDateLabel } from "@/lib/sales-log/daily-reports";
import { DailyReportDayNav } from "@/components/daily-reports/daily-report-day-nav";
import { DailyReportDetailView } from "@/components/daily-reports/daily-report-detail";

type Props = {
  searchParams: Promise<{ date?: string; userId?: string }>;
};

export default async function MobileReportsPage({ searchParams }: Props) {
  const session = await requireRole(MOBILE_MANAGER_ROLES);
  const params = await searchParams;
  const dayParams = parseDailyReportDayParams(params);
  const showAll = canViewAllDailyReports(session.user.role);

  const [subjectUser, salesUsers] = await Promise.all([
    resolveDailyReportSubjectUser(session.user.role, session.user.id, dayParams.userId),
    showAll
      ? prisma.user.findMany({
          where: { role: "SALES", personnelProfile: { enabled: true } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  if (!subjectUser) notFound();

  const activeParams = { date: dayParams.date, userId: subjectUser.id };
  const report = await getDailyReportDayView(
    session.user.role,
    session.user.id,
    activeParams.date,
    subjectUser.id
  );
  if (!report) notFound();

  const nav = dailyReportDayNavDates(activeParams.date);
  const [y, m] = activeParams.date.split("-").map(Number);
  const markedDates = await listDailyReportMarkedDates(subjectUser.id, y, m);
  const maxDate = defaultDailyReportDayDate();
  const hasActivity =
    report.checkIns.length > 0 ||
    report.followUps.length > 0 ||
    Boolean(report.dailyReport?.trim()) ||
    report.status === "SUBMITTED" ||
    report.status === "RISK_SUBMITTED";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">日报管理</h1>
        <p className="text-xs text-muted-foreground">
          {formatDailyReportDateLabel(report.logDate)}
          {showAll ? ` · ${subjectUser.name}` : ""}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-8">
        <DailyReportDayNav
          date={activeParams.date}
          prevDate={nav.prevDate}
          nextDate={nav.nextDate}
          canGoNext={nav.canGoNext}
          isToday={nav.isToday}
          userId={activeParams.userId}
          maxDate={maxDate}
          markedDates={markedDates}
          showUserFilter={showAll}
          salesUsers={salesUsers}
          basePath="/mobile/reports"
        />

        {!hasActivity ? (
          <p className="py-8 text-center text-sm text-muted-foreground">该日暂无记录</p>
        ) : (
          <DailyReportDetailView report={report} showUser={showAll} showDateTitle={false} />
        )}
      </div>
    </div>
  );
}
