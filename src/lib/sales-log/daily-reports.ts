import { format } from "date-fns";
import { SalesDailyLogStatus, SalesCheckInStatus, UserRole } from "@prisma/client";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import { prisma } from "@/lib/prisma";

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
  updatedAt: Date;
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

export async function getDailyReportDetail(
  id: string,
  role: UserRole,
  viewerId: string
): Promise<DailyReportDetail | null> {
  const row = await prisma.salesDailyLog.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      checkIns: {
        orderBy: { checkedInAt: "asc" },
        include: {
          customer: { select: { id: true, name: true } },
          contact: { select: { name: true } },
        },
      },
      followUps: {
        orderBy: { followUpAt: "asc" },
        include: {
          customer: { select: { id: true, name: true } },
          contact: { select: { name: true } },
          opportunity: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!row) return null;
  if (!canViewAllDailyReports(role) && row.userId !== viewerId) return null;

  return {
    id: row.id,
    logDate: row.logDate,
    status: row.status,
    dailyReport: row.dailyReport,
    structuredOutput: (row.structuredOutput as DailyReportStructuredOutput | null) ?? null,
    riskFlag: row.riskFlag,
    riskNotes: row.riskNotes,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
    user: row.user,
    checkIns: row.checkIns,
    followUps: row.followUps,
  };
}

export function formatDailyReportDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function formatDailyReportDateLabel(date: Date) {
  return format(date, "yyyy年M月d日");
}
