import { format, startOfDay } from "date-fns";
import { FollowUpMethod, OpportunityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import {
  CUSTOMER_GRADE,
  getCustomerGradeLabel,
  normalizeCustomerGrade,
} from "@/lib/customers/grade";
import { getGradeExpiryPendingCustomers } from "@/lib/customers/grade-expiry";
import {
  computeProcessCompliance,
  getMonthlyKpiBundle,
  type MonthlyKpiBundle,
  type ProcessComplianceActual,
} from "@/lib/plans-tasks/monthly-kpi";
import { CONFIG_CATEGORY, getConfigOptions } from "@/lib/config-options";

const DETAIL_LIMIT = 40;
const SILENT_LIMIT = 15;

export type WorkReviewUser = { id: string; name: string };

export type WorkReviewRange = {
  /** 含当日 00:00 */
  start: Date;
  /** 不含：次日 00:00 */
  end: Date;
  fromParam: string;
  toParam: string;
  /** 区间恰好等于某自然月时有值 */
  naturalMonth: { year: number; month: number } | null;
};

export type WorkReviewActivitySummary = {
  checkInCount: number;
  checkInCustomerCount: number;
  followUpCount: number;
  followUpCustomerCount: number;
  activeDayCount: number;
  methodBreakdown: Array<{ method: FollowUpMethod; label: string; count: number }>;
};

export type WorkReviewCoverage = {
  byGrade: Array<{ grade: string; label: string; customerCount: number }>;
  silentOverdue: Array<{
    customerId: string;
    customerName: string;
    gradeLabel: string;
    dueAt: string;
    lastInteractionAt: string;
  }>;
};

export type WorkReviewOpportunityBlock = {
  createdCount: number;
  created: Array<{
    id: string;
    title: string;
    customerName: string;
    stageLabel: string;
    createdAt: string;
  }>;
  stageAdvanceCount: number;
  stageAdvances: Array<{
    id: string;
    opportunityId: string;
    opportunityTitle: string;
    customerName: string;
    fromStageLabel: string;
    toStageLabel: string;
    createdAt: string;
    countedAsProjectDev: boolean | null;
  }>;
  signedCount: number;
  abandonedCount: number;
};

export type WorkReviewCompliance = {
  process: ProcessComplianceActual;
  riskReportCount: number;
  weeklyCompletedCount: number;
  weeklyOverduePendingCount: number;
};

export type WorkReviewDetailItem = {
  id: string;
  at: string;
  customerName: string;
  summary: string;
};

export type SalesWorkReview = {
  user: WorkReviewUser;
  range: WorkReviewRange;
  generatedAt: string;
  activity: WorkReviewActivitySummary;
  coverage: WorkReviewCoverage;
  opportunities: WorkReviewOpportunityBlock;
  compliance: WorkReviewCompliance;
  /** 仅自然月区间有值 */
  monthlyKpi: MonthlyKpiBundle | null;
  checkInDetails: WorkReviewDetailItem[];
  followUpDetails: WorkReviewDetailItem[];
};

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function parseYmd(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, day] = raw.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !day) return null;
  const d = new Date(y, m - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  return d;
}

/** 解析起止；默认本月 1 日～今天。起止含两端自然日。 */
export function resolveWorkReviewRange(
  params: { from?: string; to?: string },
  now = new Date()
): WorkReviewRange {
  const today = startOfDay(now);
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const fromDay = parseYmd(params.from) ?? defaultFrom;
  let toDay = parseYmd(params.to) ?? today;

  if (toDay < fromDay) {
    toDay = fromDay;
  }

  // 防止未来过远：结束日不超过今天
  if (toDay > today) toDay = today;

  const start = startOfDay(fromDay);
  const end = startOfDay(new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1));

  const naturalMonth = detectNaturalMonth(start, end, now);

  return {
    start,
    end,
    fromParam: ymd(start),
    toParam: ymd(toDay),
    naturalMonth,
  };
}

/**
 * 可对照月 KPI：
 * - 完整自然月；或
 * - 当前月「月初～今天」（月至今）
 * 历史月的部分区间不挂 KPI，避免与整月实际数错位。
 */
function detectNaturalMonth(
  start: Date,
  end: Date,
  now: Date
): { year: number; month: number } | null {
  if (start.getDate() !== 1) return null;
  const year = start.getFullYear();
  const month = start.getMonth() + 1;
  const nextMonthStart = new Date(year, month, 1);
  if (end.getTime() > nextMonthStart.getTime()) return null;
  if (end.getTime() <= start.getTime()) return null;

  if (end.getTime() === nextMonthStart.getTime()) {
    return { year, month };
  }

  const today = startOfDay(now);
  const lastInclusive = startOfDay(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1));
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  if (isCurrentMonth && lastInclusive.getTime() === today.getTime()) {
    return { year, month };
  }
  return null;
}

function dayKey(d: Date): string {
  return ymd(d);
}

export async function getSalesWorkReview(
  userId: string,
  range: WorkReviewRange,
  now = new Date()
): Promise<SalesWorkReview | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) return null;

  const { start, end } = range;

  const [
    checkIns,
    followUps,
    createdCount,
    opportunitiesCreated,
    signedInRange,
    abandonedInRange,
    process,
    riskReportCount,
    weeklyCompletedCount,
    weeklyOverduePendingCount,
    silentItems,
    gradeOptions,
    stageOptions,
    monthlyKpi,
  ] = await Promise.all([
    prisma.salesCheckIn.findMany({
      where: { userId, checkedInAt: { gte: start, lt: end } },
      select: {
        id: true,
        checkedInAt: true,
        notes: true,
        locationText: true,
        customerId: true,
        customer: { select: { name: true } },
      },
      orderBy: { checkedInAt: "desc" },
    }),
    prisma.followUp.findMany({
      where: { userId, followUpAt: { gte: start, lt: end }, confirmStatus: "CONFIRMED" },
      select: {
        id: true,
        followUpAt: true,
        method: true,
        content: true,
        customerId: true,
        customer: { select: { name: true, customerGrade: true } },
      },
      orderBy: { followUpAt: "desc" },
    }),
    prisma.opportunity.count({
      where: { ownerId: userId, createdAt: { gte: start, lt: end } },
    }),
    prisma.opportunity.findMany({
      where: { ownerId: userId, createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        title: true,
        stage: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: DETAIL_LIMIT,
    }),
    prisma.opportunity.count({
      where: {
        ownerId: userId,
        status: OpportunityStatus.SIGNED,
        updatedAt: { gte: start, lt: end },
      },
    }),
    prisma.opportunity.count({
      where: {
        ownerId: userId,
        status: OpportunityStatus.ABANDONED,
        updatedAt: { gte: start, lt: end },
      },
    }),
    computeProcessCompliance(userId, start, end, now),
    prisma.salesDailyLog.count({
      where: {
        userId,
        logDate: { gte: start, lt: end },
        status: "RISK_SUBMITTED",
      },
    }),
    prisma.salesWeeklyAssignment.count({
      where: {
        assigneeId: userId,
        status: "COMPLETED",
        completedAt: { gte: start, lt: end },
      },
    }),
    prisma.salesWeeklyAssignment.count({
      where: {
        assigneeId: userId,
        status: "PENDING",
        dueAt: { lt: now },
      },
    }),
    getGradeExpiryPendingCustomers("SALES", userId, now, SILENT_LIMIT),
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_GRADE),
    getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    range.naturalMonth
      ? getMonthlyKpiBundle(userId, range.naturalMonth.year, range.naturalMonth.month, now)
      : Promise.resolve(null),
  ]);

  const stageAdvances = await listStageAdvancesInRange(userId, start, end);

  const checkInCustomerIds = new Set(
    checkIns.map((row) => row.customerId).filter((id): id is string => Boolean(id))
  );
  const followUpCustomerIds = new Set(followUps.map((row) => row.customerId));

  const activeDays = new Set<string>();
  for (const row of checkIns) activeDays.add(dayKey(row.checkedInAt));
  for (const row of followUps) activeDays.add(dayKey(row.followUpAt));

  const methodCounts = new Map<FollowUpMethod, number>();
  for (const row of followUps) {
    methodCounts.set(row.method, (methodCounts.get(row.method) ?? 0) + 1);
  }
  const methodBreakdown = (Object.keys(FOLLOW_UP_METHOD_LABELS) as FollowUpMethod[])
    .map((method) => ({
      method,
      label: FOLLOW_UP_METHOD_LABELS[method],
      count: methodCounts.get(method) ?? 0,
    }))
    .filter((row) => row.count > 0);

  const gradeLabelMap = Object.fromEntries(gradeOptions.map((o) => [o.value, o.label]));
  const gradeCustomerSets = new Map<string, Set<string>>();
  for (const row of followUps) {
    const grade = normalizeCustomerGrade(row.customer.customerGrade) ?? CUSTOMER_GRADE.NONE;
    const set = gradeCustomerSets.get(grade) ?? new Set();
    set.add(row.customerId);
    gradeCustomerSets.set(grade, set);
  }
  const byGrade = [...gradeCustomerSets.entries()]
    .map(([grade, set]) => ({
      grade,
      label: getCustomerGradeLabel(grade, gradeLabelMap) ?? grade,
      customerCount: set.size,
    }))
    .sort((a, b) => b.customerCount - a.customerCount);

  const stageLabel = Object.fromEntries(stageOptions.map((o) => [o.value, o.label]));

  return {
    user: { id: user.id, name: user.name },
    range,
    generatedAt: now.toISOString(),
    activity: {
      checkInCount: checkIns.length,
      checkInCustomerCount: checkInCustomerIds.size,
      followUpCount: followUps.length,
      followUpCustomerCount: followUpCustomerIds.size,
      activeDayCount: activeDays.size,
      methodBreakdown,
    },
    coverage: {
      byGrade,
      silentOverdue: silentItems.map((item) => ({
        customerId: item.customerId,
        customerName: item.customerName,
        gradeLabel: getCustomerGradeLabel(item.customerGrade, gradeLabelMap) ?? "未分级",
        dueAt: item.dueAt.toISOString(),
        lastInteractionAt: item.lastInteractionAt.toISOString(),
      })),
    },
    opportunities: {
      createdCount,
      created: opportunitiesCreated.map((o) => ({
        id: o.id,
        title: o.title,
        customerName: o.customer?.name ?? "未指定客户",
        stageLabel: stageLabel[o.stage] ?? o.stage,
        createdAt: o.createdAt.toISOString(),
      })),
      stageAdvanceCount: stageAdvances.length,
      stageAdvances: stageAdvances.slice(0, DETAIL_LIMIT).map((item) => ({
        id: item.id,
        opportunityId: item.opportunityId,
        opportunityTitle: item.opportunityTitle,
        customerName: item.customerName,
        fromStageLabel: item.fromStageLabel,
        toStageLabel: item.toStageLabel,
        createdAt: item.createdAt,
        countedAsProjectDev: item.countedAsProjectDev,
      })),
      signedCount: signedInRange,
      abandonedCount: abandonedInRange,
    },
    compliance: {
      process,
      riskReportCount,
      weeklyCompletedCount,
      weeklyOverduePendingCount,
    },
    monthlyKpi,
    checkInDetails: checkIns.slice(0, DETAIL_LIMIT).map((row) => ({
      id: row.id,
      at: row.checkedInAt.toISOString(),
      customerName: row.customer?.name ?? "未关联客户",
      summary: row.notes?.trim() || row.locationText?.trim() || "打卡拜访",
    })),
    followUpDetails: followUps.slice(0, DETAIL_LIMIT).map((row) => ({
      id: row.id,
      at: row.followUpAt.toISOString(),
      customerName: row.customer.name,
      summary: `${FOLLOW_UP_METHOD_LABELS[row.method]} · ${truncate(row.content, 80)}`,
    })),
  };
}

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function listStageAdvancesInRange(userId: string, start: Date, end: Date) {
  const stageOptions = await prisma.configOption.findMany({
    where: { category: "opportunity_stage", enabled: true },
    select: { value: true, label: true, sortOrder: true },
  });
  const stageOrder = new Map(stageOptions.map((s) => [s.value, s.sortOrder]));
  const stageLabel = new Map(stageOptions.map((s) => [s.value, s.label]));

  const logs = await prisma.opportunityStageLog.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      fromStage: { not: null },
      opportunity: { ownerId: userId },
    },
    select: {
      id: true,
      fromStage: true,
      toStage: true,
      createdAt: true,
      countedAsProjectDev: true,
      opportunity: {
        select: {
          id: true,
          title: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return logs
    .filter((log) => {
      if (!log.fromStage) return false;
      const fromOrder = stageOrder.get(log.fromStage);
      const toOrder = stageOrder.get(log.toStage);
      if (fromOrder == null || toOrder == null) return false;
      return toOrder > fromOrder;
    })
    .map((log) => ({
      id: log.id,
      opportunityId: log.opportunity.id,
      opportunityTitle: log.opportunity.title,
      customerName: log.opportunity.customer?.name ?? "未指定客户",
      fromStage: log.fromStage!,
      toStage: log.toStage,
      fromStageLabel: stageLabel.get(log.fromStage!) ?? log.fromStage!,
      toStageLabel: stageLabel.get(log.toStage) ?? log.toStage,
      createdAt: log.createdAt.toISOString(),
      countedAsProjectDev: log.countedAsProjectDev,
    }));
}
