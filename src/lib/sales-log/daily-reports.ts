import { format } from "date-fns";
import { SalesDailyLogStatus, SalesCheckInStatus, UserRole } from "@prisma/client";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import { prisma } from "@/lib/prisma";
import {
  ensureCompanyCalendarCache,
  isDailyReportRequiredForUser,
} from "@/lib/calendar/cn-daily-report-days";
import {
  ensureUnsubmittedDailyReportPlaceholder,
  UNSUBMITTED_DAILY_REPORT_BODY,
} from "@/lib/sales-log/unsubmitted-daily-report";

export const DAILY_LOG_STATUS_LABELS: Record<SalesDailyLogStatus, string> = {
  IN_PROGRESS: "进行中",
  PENDING_CONFIRM: "待确认",
  SUBMITTED: "已提交",
  RISK_SUBMITTED: "已提交（有风险）",
};

export type DailyReportStructuredOutput = {
  dailyReport?: string;
  tomorrowPlan?: string | null;
  summary?: unknown;
  submittedAt?: string;
};

export type DailyReportDetail = {
  id: string;
  logDate: Date;
  status: SalesDailyLogStatus;
  dailyReport: string | null;
  structuredOutput: DailyReportStructuredOutput | null;
  riskFlag: boolean;
  riskNotes: string | null;
  submittedAt: Date | null;
  lateMarkedAt: Date | null;
  updatedAt: Date;
  /** 是否需交日报（周末/法定假/请假免报为 false） */
  reportRequired: boolean;
  /** AI 助理对话（最近 7 天内有记录时可供查阅） */
  conversation: Array<{ role: string; content: string }> | null;
  user: { id: string; name: string };
  checkIns: {
    id: string;
    customerId: string | null;
    checkedInAt: Date;
    locationText: string | null;
    addressProvince: string | null;
    addressCity: string | null;
    addressDistrict: string | null;
    addressStreet: string | null;
    notes: string | null;
    status: SalesCheckInStatus;
    customer: { id: string; name: string } | null;
    contact: { name: string } | null;
  }[];
  followUps: {
    id: string;
    followUpAt: Date;
    method: string;
    content: string;
    nextFollowUpAt: Date | null;
    customer: { id: string; name: string };
    contact: { name: string } | null;
    opportunity: { id: string; title: string } | null;
  }[];
};

const detailInclude = {
  user: { select: { id: true, name: true } },
  checkIns: {
    orderBy: { checkedInAt: "asc" as const },
    include: {
      customer: { select: { id: true, name: true } },
      contact: { select: { name: true } },
    },
  },
  followUps: {
    orderBy: { followUpAt: "asc" as const },
    include: {
      customer: { select: { id: true, name: true } },
      contact: { select: { name: true } },
      opportunity: { select: { id: true, title: true } },
    },
  },
};

export async function getDailyReportDetail(
  id: string,
  role: UserRole,
  viewerId: string
): Promise<DailyReportDetail | null> {
  const row = await prisma.salesDailyLog.findUnique({
    where: { id },
    include: detailInclude,
  });

  if (!row) return null;
  if (!canViewAllDailyReports(role) && row.userId !== viewerId) return null;

  await ensureCompanyCalendarCache();
  await ensureUnsubmittedDailyReportPlaceholder({
    userId: row.userId,
    logDate: row.logDate,
  });
  const reportRequired = await isDailyReportRequiredForUser(row.userId, row.logDate);

  const fresh = await prisma.salesDailyLog.findUnique({
    where: { id: row.id },
    include: detailInclude,
  });

  // 非考核日占位已删：保留该日骨架展示（无告警）
  const effective = fresh ?? {
    ...row,
    dailyReport: null,
    lateMarkedAt: null,
    status: SalesDailyLogStatus.IN_PROGRESS,
    submittedAt: null,
  };

  const body = effective.dailyReport?.trim() ?? null;
  const cleanedBody =
    !reportRequired && body === UNSUBMITTED_DAILY_REPORT_BODY ? null : effective.dailyReport;

  return {
    id: effective.id,
    logDate: effective.logDate,
    status: effective.status,
    dailyReport: cleanedBody,
    structuredOutput: (effective.structuredOutput as DailyReportStructuredOutput | null) ?? null,
    riskFlag: effective.riskFlag,
    riskNotes: effective.riskNotes,
    submittedAt: effective.submittedAt,
    lateMarkedAt: reportRequired ? effective.lateMarkedAt : null,
    updatedAt: effective.updatedAt,
    reportRequired,
    conversation: Array.isArray(effective.conversation)
      ? (effective.conversation as Array<{ role: string; content: string }>)
      : null,
    user: effective.user,
    checkIns: effective.checkIns,
    followUps: effective.followUps,
  };
}

export function formatDailyReportDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function formatDailyReportDateLabel(date: Date) {
  return format(date, "yyyy年M月d日");
}
