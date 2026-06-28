import Link from "next/link";
import { format } from "date-fns";
import { checkInStatusLabel } from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import {
  formatDailyReportDateLabel,
  type DailyReportDetail,
} from "@/lib/sales-log/daily-reports";
import {
  DAILY_REPORT_DEADLINE_HOUR,
  formatDailyReportDeadlineHint,
  resolveDailyReportDisplayStatus,
} from "@/lib/sales-log/daily-report-submission";
import { DailyReportStatusBadge } from "@/components/daily-reports/daily-report-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  report: DailyReportDetail;
  showUser?: boolean;
  showDateTitle?: boolean;
};

export function DailyReportDetailView({ report, showUser, showDateTitle = true }: Props) {
  const tomorrowPlan = report.structuredOutput?.tomorrowPlan?.trim();
  const display = resolveDailyReportDisplayStatus(report);
  const hasIssue = display.overdue || display.lateSubmission;
  const issueTone = display.overdue
    ? "text-red-700 dark:text-red-300"
    : "text-orange-700 dark:text-orange-300";
  const issueValueTone = display.overdue
    ? "font-medium text-red-700 dark:text-red-300"
    : display.lateSubmission
      ? "font-medium text-orange-700 dark:text-orange-300"
      : undefined;
  const issueBorderClass = display.overdue
    ? "border-red-200 dark:border-red-900"
    : "border-orange-200 dark:border-orange-900";
  const issuePanelClass = display.overdue
    ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    : "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100";
  const issueBodyClass = display.overdue
    ? "border-red-200 bg-red-50/60 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
    : "border-orange-200 bg-orange-50/60 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-100";

  return (
    <div className="space-y-6">
      <Card className={cn(hasIssue && issueBorderClass)}>
        {showDateTitle ? (
          <CardHeader>
            <CardTitle className="text-lg">
              {formatDailyReportDateLabel(report.logDate)} 日报
            </CardTitle>
          </CardHeader>
        ) : null}
        <CardContent className={`space-y-4 text-sm${showDateTitle ? "" : " pt-6"}`}>
          {display.overdue ? (
            <div className={cn("rounded-md border px-4 py-3", issuePanelClass)}>
              <p className="font-medium">日报未按时提交</p>
              <p className="mt-1">
                须在 {formatDailyReportDeadlineHint()} 提交；当前已超过 {DAILY_REPORT_DEADLINE_HOUR}:00
                截止时间。
              </p>
            </div>
          ) : null}
          {display.lateSubmission && display.submissionTime ? (
            <div className={cn("rounded-md border px-4 py-3", issuePanelClass)}>
              <p className="font-medium">日报迟交</p>
              <p className="mt-1">
                已于 {format(display.submissionTime, "yyyy-MM-dd HH:mm")} 提交，但超过当日{" "}
                {DAILY_REPORT_DEADLINE_HOUR}:00 截止时间。
              </p>
            </div>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            {showUser ? (
              <div>
                <dt className="text-muted-foreground">销售</dt>
                <dd className="font-medium">{report.user.name}</dd>
              </div>
            ) : null}
            <div>
              <dt className={cn("text-muted-foreground", hasIssue && issueTone)}>状态</dt>
              <dd className="mt-1">
                <DailyReportStatusBadge
                  status={report.status}
                  displayLabel={display.label}
                  overdue={display.overdue}
                  lateSubmission={display.lateSubmission}
                  riskFlag={report.riskFlag}
                />
              </dd>
            </div>
            <div>
              <dt className={cn("text-muted-foreground", hasIssue && issueTone)}>提交时间</dt>
              <dd className={issueValueTone}>
                {display.submissionTime
                  ? format(display.submissionTime, "yyyy-MM-dd HH:mm")
                  : display.overdue
                    ? `尚未提交（已超过 ${DAILY_REPORT_DEADLINE_HOUR}:00）`
                    : "尚未提交"}
                {display.lateSubmission ? (
                  <span className="mt-0.5 block text-xs">超过 {DAILY_REPORT_DEADLINE_HOUR}:00 截止时间</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">最后更新</dt>
              <dd>{format(report.updatedAt, "yyyy-MM-dd HH:mm")}</dd>
            </div>
          </dl>

          {report.riskFlag && report.riskNotes ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100">
              <p className="font-medium">风险说明</p>
              <p className="mt-1 whitespace-pre-wrap">{report.riskNotes}</p>
            </div>
          ) : null}

          <div>
            <p className={cn("mb-2 font-medium", hasIssue && issueTone)}>日报正文</p>
            {report.dailyReport?.trim() ? (
              <div
                className={cn(
                  "rounded-md border px-4 py-3 whitespace-pre-wrap",
                  hasIssue ? issueBodyClass : "bg-muted/30"
                )}
              >
                {report.dailyReport}
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-md border px-4 py-3",
                  hasIssue ? issueBodyClass : "text-muted-foreground"
                )}
              >
                {display.overdue
                  ? `当日日报未提交（已超过 ${DAILY_REPORT_DEADLINE_HOUR}:00 截止时间）。`
                  : report.status === "IN_PROGRESS" || report.status === "PENDING_CONFIRM"
                    ? "当日日报尚未提交。"
                    : "暂无日报正文。"}
              </div>
            )}
          </div>

          {tomorrowPlan ? (
            <div>
              <p className="mb-2 font-medium">明日计划</p>
              <div className="rounded-md border px-4 py-3 whitespace-pre-wrap">{tomorrowPlan}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">当日打卡（{report.checkIns.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {report.checkIns.length === 0 ? (
            <p className="text-sm text-muted-foreground">当日无打卡记录。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">时间</th>
                    <th className="pb-2 pr-4">客户</th>
                    <th className="pb-2 pr-4">联系人</th>
                    <th className="pb-2 pr-4">地点</th>
                    <th className="pb-2 pr-4">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {report.checkIns.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="whitespace-nowrap py-3 pr-4">
                        {format(row.checkedInAt, "HH:mm")}
                      </td>
                      <td className="py-3 pr-4">
                        {row.customer ? (
                          <Link
                            href={`/customers/${row.customer.id}`}
                            className="text-primary hover:underline"
                          >
                            {row.customer.name}
                          </Link>
                        ) : (
                          "无客户打卡"
                        )}
                      </td>
                      <td className="py-3 pr-4">{row.contact?.name ?? "—"}</td>
                      <td className="max-w-xs py-3 pr-4 text-muted-foreground">
                        {formatCheckInLocation(row) || "—"}
                      </td>
                      <td className="py-3 pr-4">{checkInStatusLabel(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">当日往来（{report.followUps.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {report.followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">当日无往来记录。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">时间</th>
                    <th className="pb-2 pr-4">客户</th>
                    <th className="pb-2 pr-4">联系人</th>
                    <th className="pb-2 pr-4">方式</th>
                    <th className="pb-2 pr-4">内容</th>
                    <th className="pb-2 pr-4">商机</th>
                    <th className="pb-2 pr-4">下次计划</th>
                  </tr>
                </thead>
                <tbody>
                  {report.followUps.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="whitespace-nowrap py-3 pr-4">
                        {format(row.followUpAt, "HH:mm")}
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/customers/${row.customer.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.customer.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{row.contact?.name ?? "—"}</td>
                      <td className="py-3 pr-4">{salesLogMethodLabel(row.method)}</td>
                      <td className="max-w-md py-3 pr-4 whitespace-pre-wrap">{row.content}</td>
                      <td className="py-3 pr-4">
                        {row.opportunity ? (
                          <Link
                            href={`/opportunities/${row.opportunity.id}`}
                            className="text-primary hover:underline"
                          >
                            {row.opportunity.title}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                        {row.nextFollowUpAt ? format(row.nextFollowUpAt, "MM-dd") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
