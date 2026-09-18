import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { monthlyAssessmentMemberWhere } from "@/lib/sales/team-performance";
import { getTargetMetricsBundle } from "@/lib/plans-tasks/metrics";
import { getMonthlyKpiBundle } from "@/lib/plans-tasks/monthly-kpi";
import {
  ensureCompanyCalendarCache,
  isDailyReportRequiredDay,
} from "@/lib/calendar/cn-daily-report-days";
import { isDailyReportSubmitted } from "@/lib/sales-log/daily-report-submission";

export type SalesMonthlyPersonRow = {
  userId: string;
  name: string;
  followUpCount: number;
  checkInCount: number;
  dailyReportRequiredDays: number;
  dailyReportSubmittedDays: number;
  dailyReportRate: number;
  salesAmount: number;
  paymentAmount: number;
  salesCost: number;
  kpi: {
    channelDev: number;
    projectDev: number;
    paymentCollection: number;
    maintenance: number;
  };
};

export type SalesMonthlySnapshot = {
  year: number;
  month: number;
  generatedAt: string;
  totals: {
    followUpCount: number;
    checkInCount: number;
    dailyReportRate: number;
    salesAmount: number;
    paymentAmount: number;
    salesCost: number;
  };
  people: SalesMonthlyPersonRow[];
};

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function requiredDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  while (cursor < end) {
    if (isDailyReportRequiredDay(cursor)) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** 按自然月自动汇总销售月报快照（不写库） */
export async function buildSalesMonthlySnapshot(
  year: number,
  month: number
): Promise<SalesMonthlySnapshot> {
  if (month < 1 || month > 12) throw new Error("无效月份");

  const { start, end } = monthRange(year, month);
  await ensureCompanyCalendarCache();

  const users = await prisma.user.findMany({
    where: monthlyAssessmentMemberWhere(),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const requiredDays = requiredDaysInMonth(year, month);
  const people: SalesMonthlyPersonRow[] = [];

  for (const user of users) {
    const [followUpCount, checkInCount, dailyLogs, metrics, kpi] = await Promise.all([
      prisma.followUp.count({
        where: {
          userId: user.id,
          followUpAt: { gte: start, lt: end },
        },
      }),
      prisma.salesCheckIn.count({
        where: {
          userId: user.id,
          checkedInAt: { gte: start, lt: end },
        },
      }),
      prisma.salesDailyLog.findMany({
        where: {
          userId: user.id,
          logDate: { gte: start, lt: end },
        },
        select: {
          logDate: true,
          status: true,
        },
      }),
      getTargetMetricsBundle(user.id, year, month),
      getMonthlyKpiBundle(user.id, year, month),
    ]);

    const logByDay = new Map(
      dailyLogs.map((row) => [format(row.logDate, "yyyy-MM-dd"), row])
    );
    let submittedDays = 0;
    for (const day of requiredDays) {
      const key = format(day, "yyyy-MM-dd");
      const log = logByDay.get(key);
      if (log && isDailyReportSubmitted(log.status)) submittedDays += 1;
    }
    const requiredCount = requiredDays.length;
    const dailyReportRate =
      requiredCount > 0 ? Math.round((submittedDays / requiredCount) * 1000) / 10 : 100;

    people.push({
      userId: user.id,
      name: user.name,
      followUpCount,
      checkInCount,
      dailyReportRequiredDays: requiredCount,
      dailyReportSubmittedDays: submittedDays,
      dailyReportRate,
      salesAmount: metrics.monthly.actual.sales,
      paymentAmount: metrics.monthly.actual.payment,
      salesCost: metrics.monthly.actual.cost,
      kpi: {
        channelDev: kpi.actuals.channelDev,
        projectDev: kpi.actuals.projectDev,
        paymentCollection: kpi.actuals.paymentCollection,
        maintenance: kpi.actuals.maintenance,
      },
    });
  }

  const totals = people.reduce(
    (acc, row) => ({
      followUpCount: acc.followUpCount + row.followUpCount,
      checkInCount: acc.checkInCount + row.checkInCount,
      salesAmount: acc.salesAmount + row.salesAmount,
      paymentAmount: acc.paymentAmount + row.paymentAmount,
      salesCost: acc.salesCost + row.salesCost,
      submittedSum: acc.submittedSum + row.dailyReportSubmittedDays,
      requiredSum: acc.requiredSum + row.dailyReportRequiredDays,
    }),
    {
      followUpCount: 0,
      checkInCount: 0,
      salesAmount: 0,
      paymentAmount: 0,
      salesCost: 0,
      submittedSum: 0,
      requiredSum: 0,
    }
  );

  return {
    year,
    month,
    generatedAt: new Date().toISOString(),
    totals: {
      followUpCount: totals.followUpCount,
      checkInCount: totals.checkInCount,
      dailyReportRate:
        totals.requiredSum > 0
          ? Math.round((totals.submittedSum / totals.requiredSum) * 1000) / 10
          : 100,
      salesAmount: totals.salesAmount,
      paymentAmount: totals.paymentAmount,
      salesCost: totals.salesCost,
    },
    people,
  };
}
