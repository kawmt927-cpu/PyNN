import { prisma } from "@/lib/prisma";
import { implementationStaffListWhere } from "@/lib/personnel/access";
import {
  compareYearMonth,
  computeMonthlyCost,
  currentYearMonth,
  isFutureYearMonth,
} from "@/lib/personnel/daily-rate";
import { serializeCopiedSnapshot } from "@/lib/personnel/cost-change-summary";
import { resolveMonthCostFromHistory } from "@/lib/personnel/resolve-month-cost";

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

function num0(value: { toNumber?: () => number } | number | null | undefined): number {
  return num(value) ?? 0;
}

/**
 * 为单人生成指定月成本草稿（已存在则跳过）。
 * 优先从上月/最近有效记录复制；无历史时建空草稿（供手动纳入离职人员）。
 */
export async function materializeMonthCostDraftForUser(input: {
  userId: string;
  year: number;
  month: number;
  /** 无历史月成本时是否仍建空行；手动纳入离职人员时为 true */
  allowEmpty?: boolean;
}): Promise<"created" | "exists" | "skipped"> {
  const { userId, year, month, allowEmpty = false } = input;

  const existing = await prisma.personnelMonthlyCostAdjustment.findUnique({
    where: { userId_year_month: { userId, year, month } },
    select: { id: true },
  });
  if (existing) return "exists";

  const historyRows = await prisma.personnelMonthlyCostAdjustment.findMany({
    where: {
      userId,
      OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
    },
    select: {
      year: true,
      month: true,
      contributionBase: true,
      baseSalary: true,
      socialSecurityCompany: true,
      housingFundCompany: true,
      adjustmentAmount: true,
      bonus: true,
      penaltyAmount: true,
      notes: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const history = historyRows.map((row) => ({
    year: row.year,
    month: row.month,
    contributionBase: num(row.contributionBase),
    baseSalary: num(row.baseSalary),
    socialSecurityCompany: num(row.socialSecurityCompany),
    housingFundCompany: num(row.housingFundCompany),
    adjustmentAmount: Number(row.adjustmentAmount),
    notes: row.notes ?? "",
  }));

  const resolved = resolveMonthCostFromHistory(history, year, month);
  if (resolved) {
    const monthly = computeMonthlyCost({
      baseSalary: resolved.baseSalary,
      socialSecurityCompany: resolved.socialSecurityCompany,
      housingFundCompany: resolved.housingFundCompany,
    });
    if (monthly != null && monthly > 0) {
      const sourceRow = historyRows.find(
        (row) =>
          row.year === resolved.sourceYear && row.month === resolved.sourceMonth
      );
      await prisma.personnelMonthlyCostAdjustment.create({
        data: {
          userId,
          year,
          month,
          contributionBase: resolved.contributionBase,
          baseSalary: resolved.baseSalary,
          socialSecurityCompany: resolved.socialSecurityCompany,
          housingFundCompany: resolved.housingFundCompany,
          adjustmentAmount: 0,
          bonus: 0,
          penaltyAmount: 0,
          copiedFromYear: resolved.sourceYear,
          copiedFromMonth: resolved.sourceMonth,
          copiedSnapshot: serializeCopiedSnapshot({
            contributionBase: resolved.contributionBase,
            baseSalary: resolved.baseSalary,
            socialSecurityCompany: resolved.socialSecurityCompany,
            housingFundCompany: resolved.housingFundCompany,
            bonus: num0(sourceRow?.bonus),
            penaltyAmount: num0(sourceRow?.penaltyAmount),
            monthAdjustment: Number(sourceRow?.adjustmentAmount ?? 0),
          }),
          confirmedAt: null,
        },
      });
      return "created";
    }
  }

  if (!allowEmpty) return "skipped";

  await prisma.personnelMonthlyCostAdjustment.create({
    data: {
      userId,
      year,
      month,
      contributionBase: null,
      baseSalary: null,
      socialSecurityCompany: null,
      housingFundCompany: null,
      adjustmentAmount: 0,
      bonus: 0,
      penaltyAmount: 0,
      confirmedAt: null,
    },
  });
  return "created";
}

/**
 * 进入成本页时：为所查看的已过月份生成待确认草稿（从上月/最近有效记录复制）。
 * 仅在职实施人员；离职人员默认不生成，需人事按月手动纳入。
 * 当月与未来月不生成；奖金、扣罚、本月调整清零。
 */
export async function ensureCurrentMonthCostsMaterialized(
  year: number,
  month: number,
  now: Date = new Date()
): Promise<{ created: number }> {
  if (isFutureYearMonth(year, month, now)) return { created: 0 };
  if (compareYearMonth({ year, month }, currentYearMonth(now)) >= 0) {
    return { created: 0 };
  }

  const confirmedInMonth = await prisma.personnelMonthlyCostAdjustment.count({
    where: { year, month, confirmedAt: { not: null } },
  });
  // 该月已有导入/已确认记录：视为历史已保存，不再补待确认草稿
  if (confirmedInMonth > 0) return { created: 0 };

  const users = await prisma.user.findMany({
    where: implementationStaffListWhere({ activeOnly: true }),
    select: { id: true },
  });

  let created = 0;
  for (const user of users) {
    const result = await materializeMonthCostDraftForUser({
      userId: user.id,
      year,
      month,
      allowEmpty: false,
    });
    if (result === "created") created += 1;
  }

  return { created };
}
