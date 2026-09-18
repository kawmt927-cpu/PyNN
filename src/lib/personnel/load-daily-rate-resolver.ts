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

/** 加载已确认的按月成本历史，构建项目核算用日费率（未确认月份不参与；缺月沿用最近已确认月） */
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
      where: {
        userId: { in: userIds },
        confirmedAt: { not: null },
      },
      select: {
        userId: true,
        year: true,
        month: true,
        baseSalary: true,
        socialSecurityCompany: true,
        housingFundCompany: true,
        adjustmentAmount: true,
        leaveDeductionAmount: true,
        bonus: true,
        penaltyAmount: true,
        attendanceDays: true,
      },
    }),
  ]);

  const fallbackDailyRateByUser = new Map<string, number>();
  // 仅在该人没有任何已确认月成本时回退档案日单价，避免未确认草稿被档案缓存绕过
  const usersWithConfirmed = new Set(monthRows.map((row) => row.userId));
  for (const profile of profiles) {
    if (usersWithConfirmed.has(profile.userId)) continue;
    if (profile.dailyRate != null) {
      fallbackDailyRateByUser.set(profile.userId, Number(profile.dailyRate));
    }
  }

  const monthCostByUserMonth = new Map<
    string,
    {
      fixedMonthlyCost: number | null;
      adjustmentAmount: number;
      leaveDeductionAmount: number;
      bonus: number;
      penaltyAmount: number;
      attendanceDays: number | null;
    }
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
      leaveDeductionAmount: Number(row.leaveDeductionAmount ?? 0),
      bonus: Number(row.bonus ?? 0),
      penaltyAmount: Number(row.penaltyAmount ?? 0),
      attendanceDays: row.attendanceDays ?? null,
    });
  }

  return buildDailyRateResolver({
    monthCostByUserMonth,
    fallbackDailyRateByUser,
  });
}
