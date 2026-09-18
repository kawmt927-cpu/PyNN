import { SalesDailyLogStatus } from "@prisma/client";
import {
  ensureCompanyCalendarCache,
  isDailyReportRequiredForUser,
} from "@/lib/calendar/cn-daily-report-days";
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

async function deleteUnsubmittedPlaceholderIfAny(userId: string, logDate: Date) {
  const existing = await prisma.salesDailyLog.findUnique({
    where: { userId_logDate: { userId, logDate } },
  });
  if (existing && isUnsubmittedDailyReportPlaceholder(existing)) {
    await prisma.salesDailyLog.delete({ where: { id: existing.id } });
  }
}

/**
 * 超过截止仍未提交时，生成真实的「未提交日报」记录（锁定 lateMarkedAt）。
 * 仅一线销售考核；周末/法定假/个人请假（免日报）不生成；若误生成过则删除占位。
 */
export async function ensureUnsubmittedDailyReportPlaceholder(input: {
  userId: string;
  logDate: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await ensureCompanyCalendarCache();

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true },
  });
  // 销管/管理员可看团队动态，但不考核本人日报
  if (!user || user.role !== "SALES") {
    await deleteUnsubmittedPlaceholderIfAny(input.userId, input.logDate);
    return null;
  }

  if (!(await isDailyReportRequiredForUser(input.userId, input.logDate))) {
    await deleteUnsubmittedPlaceholderIfAny(input.userId, input.logDate);
    return null;
  }

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

/** 批量为用户在指定日志日生成「未提交日报」（仅需交日报日、过截止且未提交） */
export async function ensureUnsubmittedDailyReportsForUsers(input: {
  userIds: string[];
  logDates: Date[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const created: string[] = [];
  for (const userId of input.userIds) {
    for (const logDate of input.logDates) {
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

/**
 * 清理非考核日（周末/法定假/请假免报）上误生成的「未提交日报」占位。
 * 读详情、团队动态、催交任务均可调用；幂等。
 */
export async function purgeInvalidUnsubmittedDailyReportPlaceholders(limit = 500) {
  await ensureCompanyCalendarCache();
  const rows = await prisma.salesDailyLog.findMany({
    where: {
      lateMarkedAt: { not: null },
      status: { in: [SalesDailyLogStatus.IN_PROGRESS, SalesDailyLogStatus.PENDING_CONFIRM] },
      OR: [{ dailyReport: UNSUBMITTED_DAILY_REPORT_BODY }, { dailyReport: "" }, { dailyReport: null }],
    },
    select: { id: true, userId: true, logDate: true, dailyReport: true, lateMarkedAt: true, status: true },
    take: limit,
  });

  let deleted = 0;
  for (const row of rows) {
    if (!isUnsubmittedDailyReportPlaceholder(row)) continue;
    if (await isDailyReportRequiredForUser(row.userId, row.logDate)) continue;
    await prisma.salesDailyLog.delete({ where: { id: row.id } });
    deleted += 1;
  }
  return { scanned: rows.length, deleted };
}
