import type { UserRole } from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  listMyTodayCheckIns,
  checkInStatusLabel,
  isEffectiveCheckInRecord,
} from "@/lib/sales-log/check-in";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { getTodayLogDate } from "@/lib/sales-log/daily-log";
import {
  getDailyReportDeadline,
  isDailyReportCountedAsLate,
  isDailyReportDayPastDeadline,
  isDailyReportSubmitted,
} from "@/lib/sales-log/daily-report-submission";
import { dailyReportMakeupDesktopPath } from "@/lib/sales-log/daily-report-reminders";
import {
  ensureUnsubmittedDailyReportPlaceholder,
  isUnsubmittedDailyReportPlaceholder,
  UNSUBMITTED_DAILY_REPORT_BODY,
} from "@/lib/sales-log/unsubmitted-daily-report";

export type TodayWorkRecord =
  | {
      kind: "check_in";
      id: string;
      at: Date;
      contactName: string | null;
      contactNames?: string[];
      customerId: string | null;
      customerName: string | null;
      summary: string;
      statusLabel: string;
      needsAction: boolean;
      nextFollowUpAt?: Date | null;
      nextFollowUpMethodLabel?: string | null;
      nextFollowUpContent?: string | null;
      followUp?: {
        id: string;
        summary: string;
        methodLabel: string;
        opportunityTitle: string | null;
      };
    }
  | {
      kind: "follow_up";
      id: string;
      at: Date;
      contactName: string | null;
      contactNames?: string[];
      customerId: string;
      customerName: string;
      summary: string;
      methodLabel: string;
      opportunityTitle: string | null;
      nextFollowUpAt?: Date | null;
      nextFollowUpMethodLabel?: string | null;
      nextFollowUpContent?: string | null;
    }
  | {
      kind: "daily_log";
      id: string;
      at: Date;
      title: string;
      summary: string;
      statusLabel: string;
      logSubmitted: boolean;
      logLate: boolean;
      logPendingMakeup: boolean;
      makeupHref: string | null;
      detail: string | null;
    };

export async function listTodayWorkRecords(
  role: UserRole,
  userId: string,
  now = new Date()
): Promise<TodayWorkRecord[]> {
  const logDate = getTodayLogDate(now);

  if (isDailyReportDayPastDeadline(logDate, now)) {
    await ensureUnsubmittedDailyReportPlaceholder({ userId, logDate, now });
  }

  const [checkIns, followUps, dailyLog] = await Promise.all([
    listMyTodayCheckIns(userId),
    listTodayFollowUps(role, userId),
    prisma.salesDailyLog.findUnique({
      where: { userId_logDate: { userId, logDate } },
      select: {
        id: true,
        logDate: true,
        status: true,
        dailyReport: true,
        submittedAt: true,
        updatedAt: true,
        lateMarkedAt: true,
      },
    }),
  ]);

  const effectiveCheckIns = checkIns.filter(isEffectiveCheckInRecord);
  const linkedFollowUpIds = new Set(
    effectiveCheckIns.map((row) => row.followUpId).filter((id): id is string => Boolean(id))
  );

  const records: TodayWorkRecord[] = [
    ...effectiveCheckIns.map((row) => {
      const linkedFollowUp = row.followUpId
        ? followUps.find((followUp) => followUp.id === row.followUpId)
        : null;

      return {
        kind: "check_in" as const,
        id: row.id,
        at: row.checkedInAt,
        contactName: row.contact?.name ?? linkedFollowUp?.contact?.name ?? null,
        contactNames: linkedFollowUp?.contact?.name
          ? [linkedFollowUp.contact.name]
          : row.contact?.name
            ? [row.contact.name]
            : [],
        customerId: row.customer?.id ?? null,
        customerName: row.customer?.name ?? null,
        summary: formatCheckInLocation(row),
        statusLabel: checkInStatusLabel(row),
        needsAction: row.status === "PENDING" && Boolean(row.customerId),
        nextFollowUpAt: linkedFollowUp?.nextFollowUpAt ?? null,
        nextFollowUpMethodLabel: linkedFollowUp?.nextFollowUpMethod
          ? salesLogMethodLabel(linkedFollowUp.nextFollowUpMethod)
          : null,
        nextFollowUpContent: linkedFollowUp?.nextFollowUpContent?.trim() || null,
        ...(linkedFollowUp
          ? {
              followUp: {
                id: linkedFollowUp.id,
                summary: linkedFollowUp.content,
                methodLabel: salesLogMethodLabel(linkedFollowUp.method),
                opportunityTitle: linkedFollowUp.opportunity?.title ?? null,
              },
            }
          : {}),
      };
    }),
    ...followUps
      .filter((row) => !linkedFollowUpIds.has(row.id))
      .map((row) => ({
        kind: "follow_up" as const,
        id: row.id,
        at: row.followUpAt,
        contactName: row.contact?.name ?? null,
        contactNames: row.contact?.name ? [row.contact.name] : [],
        customerId: row.customer.id,
        customerName: row.customer.name,
        summary: row.content,
        methodLabel: salesLogMethodLabel(row.method),
        opportunityTitle: row.opportunity?.title ?? null,
        nextFollowUpAt: row.nextFollowUpAt,
        nextFollowUpMethodLabel: row.nextFollowUpMethod
          ? salesLogMethodLabel(row.nextFollowUpMethod)
          : null,
        nextFollowUpContent: row.nextFollowUpContent?.trim() || null,
      })),
  ];

  if (!dailyLog) {
    return records.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  if (isUnsubmittedDailyReportPlaceholder(dailyLog)) {
    records.push({
      kind: "daily_log",
      id: dailyLog.id,
      at: dailyLog.lateMarkedAt ?? getDailyReportDeadline(logDate),
      title: UNSUBMITTED_DAILY_REPORT_BODY,
      summary: UNSUBMITTED_DAILY_REPORT_BODY,
      statusLabel: "可补录",
      logSubmitted: false,
      logLate: true,
      logPendingMakeup: true,
      makeupHref: dailyReportMakeupDesktopPath(),
      detail: "超时未交，系统已生成本条。点击可补录；补录后显示迟交，不改变统计。",
    });
  } else if (isDailyReportSubmitted(dailyLog.status)) {
    const late = isDailyReportCountedAsLate({
      logDate: dailyLog.logDate,
      status: dailyLog.status,
      submittedAt: dailyLog.submittedAt,
      updatedAt: dailyLog.updatedAt,
      lateMarkedAt: dailyLog.lateMarkedAt,
    });
    records.push({
      kind: "daily_log",
      id: dailyLog.id,
      at: dailyLog.submittedAt ?? dailyLog.updatedAt,
      title: `${format(logDate, "M月d日")} 日报`,
      summary: late ? "已提交（迟交）" : "已提交",
      statusLabel: late ? "迟交" : "已提交",
      logSubmitted: true,
      logLate: late,
      logPendingMakeup: false,
      makeupHref: null,
      detail: dailyLog.dailyReport?.trim() || null,
    });
  }

  return records.sort((a, b) => b.at.getTime() - a.at.getTime());
}
