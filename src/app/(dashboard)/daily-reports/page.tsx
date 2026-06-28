import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  buildDailyReportDayHref,
  dailyReportDayNavDates,
  getDailyReportDayView,
  parseDailyReportDayParams,
  resolveDailyReportSubjectUser,
} from "@/lib/sales-log/daily-report-day";
import { formatDailyReportDateLabel } from "@/lib/sales-log/daily-reports";
import { DailyReportDayNav } from "@/components/daily-reports/daily-report-day-nav";
import { DailyReportDetailView } from "@/components/daily-reports/daily-report-detail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  defaultDailyReportDayDate,
  listDailyReportMarkedDates,
} from "@/lib/sales-log/daily-report-day";

type Props = {
  searchParams: Promise<{
    date?: string;
    userId?: string;
  }>;
};

export default async function DailyReportsPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const params = await searchParams;
  const dayParams = parseDailyReportDayParams(params);
  const showAll = canViewAllDailyReports(session.user.role);

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {formatDailyReportDateLabel(report.logDate)}
            {showAll ? ` · ${report.user.name}` : ""}
            {nav.isToday ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">（今天）</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
          />
        </CardContent>
      </Card>

      {!hasActivity ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            该日暂无打卡、往来或日报记录。
            {nav.canGoNext ? null : (
              <>
                {" "}
                可点「上一天」查看历史，或通过日期选择器跳转。
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <DailyReportDetailView report={report} showUser={showAll} showDateTitle={false} />
      )}
    </div>
  );
}
