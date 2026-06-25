import { endOfDay, startOfDay } from "date-fns";
import { FollowUpMethod, SalesDailyLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signedContractStatusFilter } from "@/lib/contracts/access";
import { sumContractPaymentsForOwner } from "@/lib/contracts/payment-actuals";
import { getLastInteractionBefore } from "@/lib/customers/grade-expiry";
import {
  computeGradeFollowUpDueAt,
  getCustomerGradeIntervalMap,
  isWithinGradeExpiryWindow,
  resolveGradeIntervalDays,
} from "@/lib/customers/grade-intervals";
import { getProjectDevMinStageSortOrder } from "@/lib/plans-tasks/kpi-config";

/** 日报须在当日 22:00 前提交 */
export const DAILY_REPORT_DEADLINE_HOUR = 22;

export type MonthlyKpiTargets = {
  channelDev: number | null;
  projectDev: number | null;
  paymentCollection: number | null;
  maintenance: number | null;
};

export type ProcessComplianceActual = {
  onTimeCount: number;
  lateCount: number;
  missedCount: number;
};

export type MonthlyKpiActuals = {
  channelDev: number;
  projectDev: number;
  /** 回款催收：合同回款自动累加（PaymentInstallment） */
  paymentCollection: number;
  processCompliance: ProcessComplianceActual;
  maintenance: number;
};

export type MonthlyKpiBundle = {
  year: number;
  month: number;
  targets: MonthlyKpiTargets | null;
  actuals: MonthlyKpiActuals;
};

function monthRange(year: number, month: number) {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

function sameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSubmittedStatus(status: SalesDailyLogStatus) {
  return status === SalesDailyLogStatus.SUBMITTED || status === SalesDailyLogStatus.RISK_SUBMITTED;
}

function isLateSubmission(submittedAt: Date, logDate: Date): boolean {
  const deadline = new Date(logDate);
  deadline.setHours(DAILY_REPORT_DEADLINE_HOUR, 0, 0, 0);
  return submittedAt > deadline;
}

async function countChannelDevelopment(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: {
      ownerId: userId,
      customerType: "CHANNEL",
      createdAt: { gte: start, lt: end },
    },
    select: { id: true },
  });
  if (customers.length === 0) return 0;

  const customerIds = customers.map((c) => c.id);
  const withFollowUp = await prisma.followUp.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: customerIds },
      followUpAt: { gte: start, lt: end },
    },
  });

  return withFollowUp.length;
}

async function countProjectDevelopment(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const minSortOrder = await getProjectDevMinStageSortOrder();
  const milestoneStages =
    minSortOrder != null
      ? await prisma.configOption.findMany({
          where: {
            category: "opportunity_stage",
            enabled: true,
            sortOrder: { gte: minSortOrder },
          },
          select: { value: true },
        })
      : [];
  const milestoneValues = new Set(milestoneStages.map((s) => s.value));

  const qualified = new Set<string>();

  const signedContracts = await prisma.contract.findMany({
    where: {
      ownerId: userId,
      signedAt: { gte: start, lt: end },
      opportunityId: { not: null },
      ...signedContractStatusFilter(),
    },
    select: { opportunityId: true },
  });
  for (const row of signedContracts) {
    if (row.opportunityId) qualified.add(row.opportunityId);
  }

  if (milestoneValues.size > 0) {
    const stageLogs = await prisma.opportunityStageLog.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        toStage: { in: [...milestoneValues] },
        opportunity: { ownerId: userId },
      },
      select: { opportunityId: true },
    });
    for (const row of stageLogs) {
      qualified.add(row.opportunityId);
    }
  }

  return qualified.size;
}

async function sumPaymentCollection(userId: string, start: Date, end: Date): Promise<number> {
  return sumContractPaymentsForOwner(userId, start, end);
}

async function computeProcessCompliance(
  userId: string,
  start: Date,
  end: Date,
  now: Date
): Promise<ProcessComplianceActual> {
  const periodEnd = now < end ? now : end;
  const [logs, checkIns] = await Promise.all([
    prisma.salesDailyLog.findMany({
      where: {
        userId,
        logDate: { gte: start, lt: end },
      },
      select: { logDate: true, status: true, submittedAt: true, updatedAt: true },
    }),
    prisma.salesCheckIn.findMany({
      where: {
        userId,
        checkedInAt: { gte: start, lt: end },
      },
      select: { checkedInAt: true },
    }),
  ]);

  let onTimeCount = 0;
  let lateCount = 0;
  let missedCount = 0;

  for (let day = new Date(start); day < periodEnd; day.setDate(day.getDate() + 1)) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    if (dayStart >= periodEnd) break;

    const log = logs.find((row) => sameCalendarDay(row.logDate, dayStart));
    const hasCheckIn = checkIns.some((row) => sameCalendarDay(row.checkedInAt, dayStart));
    const submitted = log && isSubmittedStatus(log.status);

    if (!submitted) {
      if (now > dayEnd) missedCount += 1;
      continue;
    }

    const submittedAt = log.submittedAt ?? log.updatedAt;
    const late = isLateSubmission(submittedAt, dayStart);
    const compliant = hasCheckIn && !late;

    if (compliant) {
      onTimeCount += 1;
    } else if (late) {
      lateCount += 1;
    } else {
      missedCount += 1;
    }
  }

  return { onTimeCount, lateCount, missedCount };
}

async function countMaintenanceVisits(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const intervalMap = await getCustomerGradeIntervalMap();
  const visits = await prisma.followUp.findMany({
    where: {
      userId,
      method: FollowUpMethod.FACE_VISIT,
      followUpAt: { gte: start, lt: end },
    },
    select: {
      customerId: true,
      followUpAt: true,
      customer: { select: { customerGrade: true } },
    },
  });

  const countedCustomers = new Set<string>();
  let total = 0;

  for (const visit of visits) {
    if (!visit.customerId || countedCustomers.has(visit.customerId)) continue;

    const intervalDays = resolveGradeIntervalDays(visit.customer?.customerGrade, intervalMap);
    if (!intervalDays) continue;

    const lastBefore = await getLastInteractionBefore(visit.customerId, visit.followUpAt);
    if (!lastBefore) continue;
    const dueAt = computeGradeFollowUpDueAt(lastBefore, intervalDays);
    if (!isWithinGradeExpiryWindow(visit.followUpAt, dueAt)) continue;

    countedCustomers.add(visit.customerId);
    total += 1;
  }

  return total;
}

function toMonthlyKpiTargets(row: {
  channelDevTarget: number | null;
  projectDevTarget: number | null;
  paymentCollectionTarget: { toString(): string } | null;
  maintenanceTarget: number | null;
}): MonthlyKpiTargets {
  return {
    channelDev: row.channelDevTarget,
    projectDev: row.projectDevTarget,
    paymentCollection:
      row.paymentCollectionTarget != null ? Number(row.paymentCollectionTarget) : null,
    maintenance: row.maintenanceTarget,
  };
}

export async function getMonthlyKpiBundle(
  userId: string,
  year: number,
  month: number,
  now = new Date()
): Promise<MonthlyKpiBundle> {
  const { start, end } = monthRange(year, month);

  const [targetRow, channelDev, projectDev, paymentCollection, processCompliance, maintenance] =
    await Promise.all([
      prisma.salesMonthlyTarget.findUnique({
        where: { userId_year_month: { userId, year, month } },
      }),
      countChannelDevelopment(userId, start, end),
      countProjectDevelopment(userId, start, end),
      sumPaymentCollection(userId, start, end),
      computeProcessCompliance(userId, start, end, now),
      countMaintenanceVisits(userId, start, end),
    ]);

  return {
    year,
    month,
    targets: targetRow ? toMonthlyKpiTargets(targetRow) : null,
    actuals: {
      channelDev,
      projectDev,
      paymentCollection,
      processCompliance,
      maintenance,
    },
  };
}

export function countKpiProgress(actual: number, target: number | null | undefined): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((actual / target) * 100);
}

export function formatKpiCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

export function formatKpiAmount(value: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/**
 * 回款催收与合同模块联动：当前按 PaymentInstallment.paidAt 累加。
 * 合同/回款功能完善后，在此统一口径（例如按认领销售、分期计划等）。
 */
export const PAYMENT_COLLECTION_KPI_NOTE =
  "回款金额来自已登记回款记录；合同模块完善后将自动对齐口径。";
