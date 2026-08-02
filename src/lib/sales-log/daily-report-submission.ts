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

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 日志日是否早于「今天」（不含今天）——历史日不按漏交考核 */
export function isDailyReportLogDateBeforeToday(logDate: Date, now = new Date()) {
  return startOfLocalDay(logDate).getTime() < startOfLocalDay(now).getTime();
}

export function isLateDailyReportSubmission(submittedAt: Date, logDate: Date) {
  return submittedAt.getTime() > getDailyReportDeadline(logDate).getTime();
}

/**
 * 是否计入「迟交」：
 * - 已由 22:00 任务锁定 lateMarkedAt（补录后仍算迟交）
 * - 或已提交且提交时间晚于当日截止
 */
export function isDailyReportCountedAsLate(report: {
  logDate: Date;
  status: SalesDailyLogStatus;
  submittedAt: Date | null;
  updatedAt: Date;
  lateMarkedAt?: Date | null;
}) {
  if (report.lateMarkedAt) return true;
  if (!isDailyReportSubmitted(report.status)) return false;
  const submissionTime = resolveDailyReportSubmissionTime(report);
  return isLateDailyReportSubmission(submissionTime, report.logDate);
}

export function isDailyReportSubmissionOverdue(
  logDate: Date,
  status: SalesDailyLogStatus,
  now = new Date()
) {
  if (isDailyReportSubmitted(status)) return false;
  // 今天之前的历史日：不按「未按时提交」考核（导入往来等）
  if (isDailyReportLogDateBeforeToday(logDate, now)) return false;
  return now.getTime() > getDailyReportDeadline(logDate).getTime();
}

/** 该日志日是否已过日报截止（可展示未提交/迟交补录） */
export function isDailyReportDayPastDeadline(logDate: Date, now = new Date()) {
  return now.getTime() > getDailyReportDeadline(logDate).getTime();
}

export function missingDailyLogActivityId(userId: string, dayKey: string) {
  return `missing-${userId}-${dayKey}`;
}

export function formatDailyReportDeadlineHint() {
  return `当日 ${DAILY_REPORT_DEADLINE_HOUR}:00 前`;
}

export type DailyReportDisplayStatus = {
  label: string;
  /** 未提交且已过截止时间 */
  overdue: boolean;
  /** 已提交但超过当日截止时间，或已锁定迟交 */
  lateSubmission: boolean;
  /** 已锁定迟交（含未补录） */
  lateMarked: boolean;
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
    lateMarkedAt?: Date | null;
    dailyReport?: string | null;
  },
  now = new Date()
): DailyReportDisplayStatus {
  const submitted = isDailyReportSubmitted(report.status);
  const lateMarked = Boolean(report.lateMarkedAt);

  if (submitted) {
    const submissionTime = resolveDailyReportSubmissionTime(report);
    const lateSubmission =
      lateMarked || isLateDailyReportSubmission(submissionTime, report.logDate);
    const baseLabel = DAILY_LOG_STATUS_LABELS[report.status];
    return {
      label: lateSubmission ? `${baseLabel}（迟交）` : baseLabel,
      overdue: false,
      submitted: true,
      lateSubmission,
      lateMarked,
      submissionTime,
    };
  }

  // 超时生成的「未提交日报」占位
  if (
    lateMarked &&
    (!report.dailyReport?.trim() || report.dailyReport.trim() === "未提交日报")
  ) {
    return {
      label: "未提交日报",
      overdue: true,
      submitted: false,
      lateSubmission: false,
      lateMarked: true,
      submissionTime: null,
    };
  }

  // 今天之前未提交：正常态「当日无日报」，不标超期（除非已锁定迟交）
  if (isDailyReportLogDateBeforeToday(report.logDate, now) && !lateMarked) {
    return {
      label: "当日无日报",
      overdue: false,
      submitted: false,
      lateSubmission: false,
      lateMarked: false,
      submissionTime: null,
    };
  }

  if (lateMarked || isDailyReportSubmissionOverdue(report.logDate, report.status, now)) {
    return {
      label: lateMarked ? "未提交（已记迟交）" : "未提交",
      overdue: true,
      submitted: false,
      lateSubmission: false,
      lateMarked,
      submissionTime: null,
    };
  }

  return {
    label: DAILY_LOG_STATUS_LABELS[report.status],
    overdue: false,
    submitted: false,
    lateSubmission: false,
    lateMarked: false,
    submissionTime: null,
  };
}
