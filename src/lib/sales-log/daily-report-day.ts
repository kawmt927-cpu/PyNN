import { format, addDays } from "date-fns";
import { SalesDailyLogStatus, UserRole } from "@prisma/client";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import { prisma } from "@/lib/prisma";
import type { DailyReportDetail } from "@/lib/sales-log/daily-reports";

export type DailyReportDayParams = {
  date: string;
  userId: string;
};

export function formatDailyReportDayParam(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

export function parseDailyReportDayParams(params: {
  date?: string;
  userId?: string;
}): DailyReportDayParams {
  const today = formatDailyReportDayParam();
  const rawDate = params.date?.trim() || today;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  return {
    date: date > today ? today : date,
    userId: params.userId?.trim() ?? "",
  };
}

export function buildDailyReportDayHref(params: DailyReportDayParams) {
  const qs = new URLSearchParams({ date: params.date });
  if (params.userId) qs.set("userId", params.userId);
  return `/daily-reports?${qs.toString()}`;
}

export function shiftDailyReportDay(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return formatDailyReportDayParam(addDays(new Date(y, m - 1, d), days));
}

function dayBounds(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, logDate: start };
}

const checkInInclude = {
  customer: { select: { id: true, name: true } },
  contact: { select: { name: true } },
} as const;

const followUpInclude = {
  customer: { select: { id: true, name: true } },
  contact: { select: { name: true } },
  opportunity: { select: { id: true, title: true } },
} as const;

export async function resolveDailyReportSubjectUser(
  role: UserRole,
  viewerId: string,
  requestedUserId: string
) {
  if (!canViewAllDailyReports(role)) {
    const user = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { id: true, name: true },
    });
    return user;
  }

  if (requestedUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: requestedUserId,
        role: "SALES",
        personnelProfile: { enabled: true },
      },
      select: { id: true, name: true },
    });
    if (user) return user;
  }

  return prisma.user.findFirst({
    where: { role: "SALES", personnelProfile: { enabled: true } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getDailyReportDayView(
  role: UserRole,
  viewerId: string,
  dateStr: string,
  subjectUserId: string
): Promise<DailyReportDetail | null> {
  if (!canViewAllDailyReports(role) && subjectUserId !== viewerId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: subjectUserId },
    select: { id: true, name: true },
  });
  if (!user) return null;

  const { start, end, logDate } = dayBounds(dateStr);

  const [dailyLog, checkIns, followUps] = await Promise.all([
    prisma.salesDailyLog.findUnique({
      where: { userId_logDate: { userId: subjectUserId, logDate } },
    }),
    prisma.salesCheckIn.findMany({
      where: {
        userId: subjectUserId,
        checkedInAt: { gte: start, lt: end },
      },
      orderBy: { checkedInAt: "asc" },
      include: checkInInclude,
    }),
    prisma.followUp.findMany({
      where: {
        userId: subjectUserId,
        followUpAt: { gte: start, lt: end },
      },
      orderBy: { followUpAt: "asc" },
      include: followUpInclude,
    }),
  ]);

  const emptyStatus = SalesDailyLogStatus.IN_PROGRESS;

  return {
    id: dailyLog?.id ?? `day-${subjectUserId}-${dateStr}`,
    logDate,
    status: dailyLog?.status ?? emptyStatus,
    dailyReport: dailyLog?.dailyReport ?? null,
    structuredOutput: (dailyLog?.structuredOutput as DailyReportDetail["structuredOutput"]) ?? null,
    riskFlag: dailyLog?.riskFlag ?? false,
    riskNotes: dailyLog?.riskNotes ?? null,
    submittedAt: dailyLog?.submittedAt ?? null,
    updatedAt: dailyLog?.updatedAt ?? logDate,
    user,
    checkIns,
    followUps,
  };
}

export function dailyReportDayNavDates(dateStr: string) {
  const today = formatDailyReportDayParam();
  return {
    prevDate: shiftDailyReportDay(dateStr, -1),
    nextDate: shiftDailyReportDay(dateStr, 1),
    canGoNext: dateStr < today,
    isToday: dateStr === today,
  };
}

export function defaultDailyReportDayDate() {
  return formatDailyReportDayParam();
}
