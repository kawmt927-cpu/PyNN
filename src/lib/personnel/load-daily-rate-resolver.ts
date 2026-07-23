import { prisma } from "@/lib/prisma";
import {
  buildDailyRateResolver,
  computeMonthlyCost,
  type DailyRateResolver,
  yearMonthKey,
} from "@/lib/personnel/daily-rate";

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

/** 加载按月成本历史，构建项目核算用的日费率解析器（缺月沿用上月） */
export async function loadDailyRateResolver(userIds: string[]): Promise<DailyRateResolver> {
  if (userIds.length === 0) {
    return () => 0;
  }

  const [profiles, monthRows] = await Promise.all([
    prisma.personnelProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, dailyRate: true },
    }),
    prisma.personnelMonthlyCostAdjustment.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        year: true,
        month: true,
        baseSalary: true,
        socialSecurityCompany: true,
        housingFundCompany: true,
        adjustmentAmount: true,
      },
    }),
  ]);

  const fallbackDailyRateByUser = new Map<string, number>();
  for (const profile of profiles) {
    if (profile.dailyRate != null) {
      fallbackDailyRateByUser.set(profile.userId, Number(profile.dailyRate));
    }
  }

  const monthCostByUserMonth = new Map<
    string,
    { fixedMonthlyCost: number | null; adjustmentAmount: number }
  >();
  for (const row of monthRows) {
    const fixedMonthlyCost = computeMonthlyCost({
      baseSalary: num(row.baseSalary),
      socialSecurityCompany: num(row.socialSecurityCompany),
      housingFundCompany: num(row.housingFundCompany),
    });
    if (fixedMonthlyCost == null) continue;
    monthCostByUserMonth.set(`${row.userId}:${yearMonthKey(row.year, row.month)}`, {
      fixedMonthlyCost,
      adjustmentAmount: Number(row.adjustmentAmount),
    });
  }

  return buildDailyRateResolver({
    monthCostByUserMonth,
    fallbackDailyRateByUser,
  });
}
