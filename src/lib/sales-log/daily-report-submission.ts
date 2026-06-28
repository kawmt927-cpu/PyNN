import { SalesDailyLogStatus } from "@prisma/client";
import { DAILY_LOG_STATUS_LABELS } from "@/lib/sales-log/daily-reports";

/** 日报须在当日该时刻前提交 */
export const DAILY_REPORT_DEADLINE_HOUR = 22;

export function isDailyReportSubmitted(status: SalesDailyLogStatus) {
  return status === "SUBMITTED" || status === "RISK_SUBMITTED";
}

export function getDailyReportDeadline(logDate: Date) {
  const deadline = new Date(logDate);
  deadline.setHours(DAILY_REPORT_DEADLINE_HOUR, 0, 0, 0);
  return deadline;
}

export function isLateDailyReportSubmission(submittedAt: Date, logDate: Date) {
  return submittedAt.getTime() > getDailyReportDeadline(logDate).getTime();
}

export function isDailyReportSubmissionOverdue(
  logDate: Date,
  status: SalesDailyLogStatus,
  now = new Date()
) {
  if (isDailyReportSubmitted(status)) return false;
  return now.getTime() > getDailyReportDeadline(logDate).getTime();
}

export function formatDailyReportDeadlineHint() {
  return `当日 ${DAILY_REPORT_DEADLINE_HOUR}:00 前`;
}

export type DailyReportDisplayStatus = {
  label: string;
  /** 未提交且已过截止时间 */
  overdue: boolean;
  /** 已提交但超过当日截止时间 */
  lateSubmission: boolean;
  submitted: boolean;
  submissionTime: Date | null;
};

export function resolveDailyReportSubmissionTime(report: {
  submittedAt: Date | null;
  updatedAt: Date;
}) {
  return report.submittedAt ?? report.updatedAt;
}

export function resolveDailyReportDisplayStatus(
  report: {
    logDate: Date;
    status: SalesDailyLogStatus;
    submittedAt: Date | null;
    updatedAt: Date;
  },
  now = new Date()
): DailyReportDisplayStatus {
  const submitted = isDailyReportSubmitted(report.status);

  if (submitted) {
    const submissionTime = resolveDailyReportSubmissionTime(report);
    const lateSubmission = isLateDailyReportSubmission(submissionTime, report.logDate);
    const baseLabel = DAILY_LOG_STATUS_LABELS[report.status];
    return {
      label: lateSubmission ? `${baseLabel}（迟交）` : baseLabel,
      overdue: false,
      submitted: true,
      lateSubmission,
      submissionTime,
    };
  }

  if (isDailyReportSubmissionOverdue(report.logDate, report.status, now)) {
    return {
      label: "未提交",
      overdue: true,
      submitted: false,
      lateSubmission: false,
      submissionTime: null,
    };
  }

  return {
    label: DAILY_LOG_STATUS_LABELS[report.status],
    overdue: false,
    submitted: false,
    lateSubmission: false,
    submissionTime: null,
  };
}
