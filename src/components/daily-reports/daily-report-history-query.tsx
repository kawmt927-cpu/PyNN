import { DailyReportDayNav } from "@/components/daily-reports/daily-report-day-nav";
import { DailyReportDetailView } from "@/components/daily-reports/daily-report-detail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDailyReportDateLabel } from "@/lib/sales-log/daily-reports";
import type { DailyReportDetail } from "@/lib/sales-log/daily-reports";

type SalesOption = { id: string; name: string };

type Props = {
  report: DailyReportDetail;
  showAll: boolean;
  salesUsers: SalesOption[];
  activeParams: { date: string; userId: string };
  nav: {
    prevDate: string;
    nextDate: string;
    canGoNext: boolean;
    isToday: boolean;
  };
  maxDate: string;
  markedDates: string[];
  hasActivity: boolean;
};

export function DailyReportHistoryQuery({
  report,
  showAll,
  salesUsers,
  activeParams,
  nav,
  maxDate,
  markedDates,
  hasActivity,
}: Props) {
  return (
    <>
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
    </>
  );
}
