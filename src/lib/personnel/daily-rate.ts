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

/** 当月公司日历出勤日（周一～五 − 放假 + 调休）；异步版见 company-attendance */
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
  return clampYearMonthToPresent(year, month, fallback);
}

/** 当前自然月（按 Asia/Shanghai 业务日也可直接用传入 now） */
export function currentYearMonth(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function compareYearMonth(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** 不允许查看/编辑尚未到达的月份 */
export function clampYearMonthToPresent(
  year: number,
  month: number,
  now: Date = new Date()
): { year: number; month: number } {
  const current = currentYearMonth(now);
  if (compareYearMonth({ year, month }, current) > 0) return current;
  return { year, month };
}

export function isFutureYearMonth(
  year: number,
  month: number,
  now: Date = new Date()
): boolean {
  return compareYearMonth({ year, month }, currentYearMonth(now)) > 0;
}

export function isCurrentYearMonth(
  year: number,
  month: number,
  now: Date = new Date()
): boolean {
  return compareYearMonth({ year, month }, currentYearMonth(now)) === 0;
}

/**
 * 有效月成本 = 固定月成本 + 奖金 + 绩效/其他调整 − 扣罚 − 请假规则扣款
 * 结果不低于 0
 */
export function resolveEffectiveMonthlyCost(
  fixedMonthlyCost: number | null,
  adjustmentAmount: number | null | undefined,
  leaveDeductionAmount: number | null | undefined = 0,
  extras?: { bonus?: number | null; penaltyAmount?: number | null }
): number | null {
  if (fixedMonthlyCost == null) return null;
  const adjustment =
    adjustmentAmount != null && Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0;
  const leaveDeduction =
    leaveDeductionAmount != null && Number.isFinite(leaveDeductionAmount)
      ? Math.max(0, leaveDeductionAmount)
      : 0;
  const bonus =
    extras?.bonus != null && Number.isFinite(extras.bonus) ? Math.max(0, extras.bonus) : 0;
  const penalty =
    extras?.penaltyAmount != null && Number.isFinite(extras.penaltyAmount)
      ? Math.max(0, extras.penaltyAmount)
      : 0;
  return roundMoney(Math.max(0, fixedMonthlyCost + adjustment + bonus - penalty - leaveDeduction));
}

/**
 * 日成本 = 有效月成本 / 个人实际出勤天数（关账后）
 */
export function resolveDailyRateForMonth(
  effectiveMonthlyCost: number | null,
  year: number,
  month: number,
  attendanceDays?: number | null
): number | null {
  if (effectiveMonthlyCost == null) return null;
  const days =
    attendanceDays != null && attendanceDays > 0
      ? attendanceDays
      : countMonthWorkdays(new Date(year, month - 1, 1));
  if (days <= 0) return null;
  return roundMoney(effectiveMonthlyCost / days);
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
  leaveDeductionAmount: number;
  bonus: number;
  penaltyAmount: number;
  attendanceDays: number | null;
};

/**
 * 优先使用已确认按月成本；无记录时沿用更早月份的固定月成本（不含调整/假扣）。
 * 项目核算：有效月成本 ÷ 关账时锁定的个人实际出勤天数。
 */
export function buildDailyRateResolver(input: {
  monthCostByUserMonth: Map<string, MonthCostEntry>;
  fallbackDailyRateByUser?: Map<string, number>;
}): DailyRateResolver {
  const cache = new Map<string, number>();

  const lookupEntry = (userId: string, year: number, month: number) => {
    const exact = input.monthCostByUserMonth.get(`${userId}:${yearMonthKey(year, month)}`);
    if (exact) return { entry: exact, isExact: true as const };
    // walk back up to 24 months for fixed cost carry
    for (let i = 1; i <= 24; i++) {
      const shifted = shiftYearMonth(year, month, -i);
      const hit = input.monthCostByUserMonth.get(
        `${userId}:${yearMonthKey(shifted.year, shifted.month)}`
      );
      if (hit?.fixedMonthlyCost != null) {
        return {
          entry: {
            fixedMonthlyCost: hit.fixedMonthlyCost,
            adjustmentAmount: 0,
            leaveDeductionAmount: 0,
            bonus: 0,
            penaltyAmount: 0,
            attendanceDays: null,
          },
          isExact: false as const,
        };
      }
    }
    return { entry: null, isExact: false as const };
  };

  return (userId: string, date: Date) => {
    const { year, month } = yearMonthOf(date);
    const cacheKey = `${userId}:${yearMonthKey(year, month)}`;
    const cached = cache.get(cacheKey);
    if (cached != null) return cached;

    const { entry, isExact } = lookupEntry(userId, year, month);
    const effective = resolveEffectiveMonthlyCost(
      entry?.fixedMonthlyCost ?? null,
      isExact ? entry?.adjustmentAmount ?? 0 : 0,
      isExact ? entry?.leaveDeductionAmount ?? 0 : 0,
      isExact
        ? { bonus: entry?.bonus ?? 0, penaltyAmount: entry?.penaltyAmount ?? 0 }
        : undefined
    );
    const rate = resolveDailyRateForMonth(
      effective,
      year,
      month,
      isExact ? entry?.attendanceDays : null
    );
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
