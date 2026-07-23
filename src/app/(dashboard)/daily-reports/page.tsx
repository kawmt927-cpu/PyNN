import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  dailyReportDayNavDates,
  defaultDailyReportDayDate,
  getDailyReportDayView,
  listDailyReportMarkedDates,
  parseDailyReportDayParams,
  resolveDailyReportSubjectUser,
} from "@/lib/sales-log/daily-report-day";
import { DailyReportHistoryQuery } from "@/components/daily-reports/daily-report-history-query";

type Props = {
  searchParams: Promise<{
    date?: string;
    userId?: string;
    tab?: string;
  }>;
};

export default async function DailyReportsPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const params = await searchParams;
  const showAll = canViewAllDailyReports(session.user.role);
  const dayParams = parseDailyReportDayParams(params);

  const [subjectUser, salesUsers] = await Promise.all([
    resolveDailyReportSubjectUser(
      session.user.role,
      session.user.id,
      dayParams.userId
    ),
    showAll
      ? prisma.user.findMany({
          where: { role: "SALES", personnelProfile: { enabled: true } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  if (!subjectUser) notFound();

  const activeParams = {
    date: dayParams.date,
    userId: subjectUser.id,
  };

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">日报管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {showAll
            ? "先选择销售，再选日期查看打卡、往来与日报；日历圆点仅标记该销售有记录的日子。"
            : "按日查看本人的打卡、往来与日报。"}
        </p>
      </div>

      <DailyReportHistoryQuery
        report={report}
        showAll={showAll}
        salesUsers={salesUsers}
        activeParams={activeParams}
        nav={nav}
        maxDate={maxDate}
        markedDates={markedDates}
        hasActivity={hasActivity}
      />
    </div>
  );
}
