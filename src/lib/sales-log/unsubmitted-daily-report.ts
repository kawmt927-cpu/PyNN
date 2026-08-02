import { SalesDailyLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getDailyReportDeadline,
  isDailyReportDayPastDeadline,
  isDailyReportSubmitted,
} from "@/lib/sales-log/daily-report-submission";

/** 超时自动生成的占位日报正文（补录后会被真实内容覆盖） */
export const UNSUBMITTED_DAILY_REPORT_BODY = "未提交日报";

export function isUnsubmittedDailyReportPlaceholder(log: {
  status: SalesDailyLogStatus;
  dailyReport?: string | null;
  lateMarkedAt?: Date | null;
}) {
  if (isDailyReportSubmitted(log.status)) return false;
  if (!log.lateMarkedAt) return false;
  const body = log.dailyReport?.trim() ?? "";
  return body === "" || body === UNSUBMITTED_DAILY_REPORT_BODY;
}

/**
 * 超过截止仍未提交时，生成真实的「未提交日报」记录（锁定 lateMarkedAt）。
 * 已提交则不动；已有占位则补齐正文与锁定时间。
 */
export async function ensureUnsubmittedDailyReportPlaceholder(input: {
  userId: string;
  logDate: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!isDailyReportDayPastDeadline(input.logDate, now)) {
    return null;
  }

  const existing = await prisma.salesDailyLog.findUnique({
    where: {
      userId_logDate: { userId: input.userId, logDate: input.logDate },
    },
  });

  if (existing && isDailyReportSubmitted(existing.status)) {
    return existing;
  }

  const lateAt = existing?.lateMarkedAt ?? now;
  const body =
    existing?.dailyReport?.trim() &&
    existing.dailyReport.trim() !== UNSUBMITTED_DAILY_REPORT_BODY
      ? existing.dailyReport
      : UNSUBMITTED_DAILY_REPORT_BODY;

  // 已有真实草稿正文：只锁定迟交，不覆盖草稿
  const keepDraft =
    Boolean(existing?.dailyReport?.trim()) &&
    existing!.dailyReport!.trim() !== UNSUBMITTED_DAILY_REPORT_BODY;

  if (existing) {
    return prisma.salesDailyLog.update({
      where: { id: existing.id },
      data: {
        lateMarkedAt: lateAt,
        ...(keepDraft
          ? {}
          : {
              dailyReport: UNSUBMITTED_DAILY_REPORT_BODY,
              status: SalesDailyLogStatus.IN_PROGRESS,
            }),
      },
    });
  }

  return prisma.salesDailyLog.create({
    data: {
      userId: input.userId,
      logDate: input.logDate,
      conversation: [],
      status: SalesDailyLogStatus.IN_PROGRESS,
      dailyReport: UNSUBMITTED_DAILY_REPORT_BODY,
      lateMarkedAt: now,
      structuredOutput: {
        unsubmittedPlaceholder: true,
        createdAt: now.toISOString(),
        deadline: getDailyReportDeadline(input.logDate).toISOString(),
      },
    },
  });
}

/** 批量为用户在指定日志日生成「未提交日报」（仅过截止且未提交） */
export async function ensureUnsubmittedDailyReportsForUsers(input: {
  userIds: string[];
  logDates: Date[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const created: string[] = [];
  for (const userId of input.userIds) {
    for (const logDate of input.logDates) {
      if (!isDailyReportDayPastDeadline(logDate, now)) continue;
      const row = await ensureUnsubmittedDailyReportPlaceholder({
        userId,
        logDate,
        now,
      });
      if (row && isUnsubmittedDailyReportPlaceholder(row)) {
        created.push(row.id);
      }
    }
  }
  return created;
}
