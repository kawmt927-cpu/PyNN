import { prisma } from "@/lib/prisma";
import {
  computeMonthlyCost,
  isCurrentYearMonth,
  isFutureYearMonth,
  yearMonthKey,
} from "@/lib/personnel/daily-rate";
import { resolveMonthCostFromHistory } from "@/lib/personnel/resolve-month-cost";

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

/**
 * 进入当月成本页时：若某人尚无当月记录，则从上月（或更早）有效成本复制入库。
 * 未来月份不生成。
 */
export async function ensureCurrentMonthCostsMaterialized(
  year: number,
  month: number,
  now: Date = new Date()
): Promise<{ created: number }> {
  if (isFutureYearMonth(year, month, now)) return { created: 0 };
  if (!isCurrentYearMonth(year, month, now)) return { created: 0 };

  const users = await prisma.user.findMany({
    where: {
      personnelProfile: {
        staffCategory: "IMPLEMENTATION",
        enabled: true,
      },
    },
    select: {
      id: true,
      monthlyCostAdjustments: {
        where: {
          OR: [
            { year: { lt: year } },
            { year, month: { lte: month } },
          ],
        },
        select: {
          year: true,
          month: true,
          contributionBase: true,
          baseSalary: true,
          socialSecurityCompany: true,
          housingFundCompany: true,
          adjustmentAmount: true,
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
        notes: `由 ${yearMonthKey(resolved.sourceYear, resolved.sourceMonth)} 自动生成`,
      },
    });
    created += 1;
  }

  return { created };
}
