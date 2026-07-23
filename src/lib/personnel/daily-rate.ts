import { endOfMonth, startOfMonth } from "date-fns";
import { countWorkdays, toDateOnly } from "@/lib/projects/workdays";

export type PersonnelMonthlyCost = {
  contributionBase?: number | null;
  baseSalary?: number | null;
  socialSecurityCompany?: number | null;
  housingFundCompany?: number | null;
};

export type MonthlyCostRecord = PersonnelMonthlyCost & {
  year: number;
  month: number;
  adjustmentAmount: number;
  notes?: string | null;
};

/** 固定月成本 = 基本工资 + 社保公司承担 + 公积金公司承担 */
export function computeMonthlyCost(cost: PersonnelMonthlyCost): number | null {
  const parts = [cost.baseSalary, cost.socialSecurityCompany, cost.housingFundCompany];
  if (parts.every((v) => v == null)) return null;
  return roundMoney(
    parts.reduce<number>((sum, v) => sum + (v != null && Number.isFinite(v) ? v : 0), 0)
  );
}

/** @deprecated 使用 computeMonthlyCost */
export const computeTotalExpenditure = computeMonthlyCost;

/** 当月实际工作日（周一至周五） */
export function countMonthWorkdays(reference: Date = new Date()): number {
  const day = toDateOnly(reference);
  return countWorkdays(startOfMonth(day), endOfMonth(day));
}

export function yearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function yearMonthOf(date: Date): { year: number; month: number } {
  const day = toDateOnly(date);
  return { year: day.getFullYear(), month: day.getMonth() + 1 };
}

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number
): { year: number; month: number } {
  const d = new Date(year, month - 1 + deltaMonths, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function parseYearMonthParam(
  yearRaw: string | undefined,
  monthRaw: string | undefined,
  fallback: Date = new Date()
): { year: number; month: number } {
  const fallbackYear = fallback.getFullYear();
  const fallbackMonth = fallback.getMonth() + 1;
  const year = yearRaw ? Number(yearRaw) : fallbackYear;
  const month = monthRaw ? Number(monthRaw) : fallbackMonth;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { year: fallbackYear, month: fallbackMonth };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { year: fallbackYear, month: fallbackMonth };
  }
  return { year, month };
}

/**
 * 有效月成本 = 固定月成本 + 当月调整额（请假等）
 * 结果不低于 0
 */
export function resolveEffectiveMonthlyCost(
  fixedMonthlyCost: number | null,
  adjustmentAmount: number | null | undefined
): number | null {
  if (fixedMonthlyCost == null) return null;
  const adjustment =
    adjustmentAmount != null && Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0;
  return roundMoney(Math.max(0, fixedMonthlyCost + adjustment));
}

/**
 * 日成本 = 有效月成本 / 该月实际工作日
 */
export function resolveDailyRateForMonth(
  effectiveMonthlyCost: number | null,
  year: number,
  month: number
): number | null {
  if (effectiveMonthlyCost == null) return null;
  const reference = new Date(year, month - 1, 1);
  const workdays = countMonthWorkdays(reference);
  if (workdays <= 0) return null;
  return roundMoney(effectiveMonthlyCost / workdays);
}

export function resolveDailyRateForDate(
  effectiveMonthlyCost: number | null,
  date: Date
): number | null {
  const { year, month } = yearMonthOf(date);
  return resolveDailyRateForMonth(effectiveMonthlyCost, year, month);
}

/**
 * @deprecated 人员页不再预存日单价；保留给兼容调用
 */
export function computeDailyRateFromMonthlyCost(
  cost: PersonnelMonthlyCost,
  reference: Date = new Date()
): number | null {
  const total = computeMonthlyCost(cost);
  if (total == null) return null;
  const workdays = countMonthWorkdays(reference);
  if (workdays <= 0) return null;
  return roundMoney(total / workdays);
}

export type DailyRateResolver = (userId: string, date: Date) => number;

type MonthCostEntry = {
  fixedMonthlyCost: number | null;
  adjustmentAmount: number;
};

/**
 * 优先使用按月成本记录；无记录时沿用更早月份的固定月成本（不含上月调整）。
 * 项目核算按「有效月成本 ÷ 该日所在月工作日」。
 */
export function buildDailyRateResolver(input: {
  /** userId:YYYY-MM → 该月成本记录 */
  monthCostByUserMonth: Map<string, MonthCostEntry>;
  fallbackDailyRateByUser?: Map<string, number>;
}): DailyRateResolver {
  const cache = new Map<string, number>();

  function lookupEntry(userId: string, year: number, month: number): MonthCostEntry | null {
    let cursor = { year, month };
    for (let i = 0; i < 120; i++) {
      const key = `${userId}:${yearMonthKey(cursor.year, cursor.month)}`;
      const entry = input.monthCostByUserMonth.get(key);
      if (entry != null && entry.fixedMonthlyCost != null) {
        const isExact = cursor.year === year && cursor.month === month;
        return {
          fixedMonthlyCost: entry.fixedMonthlyCost,
          adjustmentAmount: isExact ? entry.adjustmentAmount : 0,
        };
      }
      cursor = shiftYearMonth(cursor.year, cursor.month, -1);
    }
    return null;
  }

  return (userId: string, date: Date) => {
    const { year, month } = yearMonthOf(date);
    const cacheKey = `${userId}:${yearMonthKey(year, month)}`;
    const cached = cache.get(cacheKey);
    if (cached != null) return cached;

    const monthEntry = lookupEntry(userId, year, month);
    const effective = resolveEffectiveMonthlyCost(
      monthEntry?.fixedMonthlyCost ?? null,
      monthEntry?.adjustmentAmount ?? 0
    );
    const rate = resolveDailyRateForMonth(effective, year, month);
    if (rate != null) {
      cache.set(cacheKey, rate);
      return rate;
    }

    const fallback = input.fallbackDailyRateByUser?.get(userId) ?? 0;
    cache.set(cacheKey, fallback);
    return fallback;
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
