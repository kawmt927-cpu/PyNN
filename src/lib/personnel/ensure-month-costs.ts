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
 * 进入成本页时：为所查看的已过月份生成待确认草稿（从上月/最近有效记录复制）。
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
    where: implementationStaffListWhere(),
    select: {
      id: true,
      monthlyCostAdjustments: {
        where: {
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
      },
    },
  });

  let created = 0;

  for (const user of users) {
    const hasExact = user.monthlyCostAdjustments.some(
      (row) => row.year === year && row.month === month
    );
    if (hasExact) continue;

    const history = user.monthlyCostAdjustments.map((row) => ({
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
    if (!resolved) continue;

    const monthly = computeMonthlyCost({
      baseSalary: resolved.baseSalary,
      socialSecurityCompany: resolved.socialSecurityCompany,
      housingFundCompany: resolved.housingFundCompany,
    });
    if (monthly == null || monthly <= 0) continue;

    const sourceRow = user.monthlyCostAdjustments.find(
      (row) => row.year === resolved.sourceYear && row.month === resolved.sourceMonth
    );

    await prisma.personnelMonthlyCostAdjustment.create({
      data: {
        userId: user.id,
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
    created += 1;
  }

  return { created };
}
