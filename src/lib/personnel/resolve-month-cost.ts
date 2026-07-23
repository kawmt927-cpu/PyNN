import { shiftYearMonth, yearMonthKey } from "@/lib/personnel/daily-rate";

export type StoredMonthCostRow = {
  year: number;
  month: number;
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  adjustmentAmount: number;
  notes: string;
};

export type ResolvedMonthCost = {
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  /** 仅精确命中当月记录时保留调整；沿用上月时为 0 */
  adjustmentAmount: number;
  notes: string;
  /** 数据来源月份（可能早于目标月） */
  sourceYear: number;
  sourceMonth: number;
  isExactMonth: boolean;
};

function hasCostBase(row: {
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
}): boolean {
  return (
    row.baseSalary != null ||
    row.socialSecurityCompany != null ||
    row.housingFundCompany != null
  );
}

/**
 * 解析某月成本：优先当月记录；否则沿用最近一个更早月份的成本基数。
 * 沿用上月时不带上月的「本月调整」。
 */
export function resolveMonthCostFromHistory(
  rows: StoredMonthCostRow[],
  year: number,
  month: number,
  maxLookbackMonths = 120
): ResolvedMonthCost | null {
  const byKey = new Map(
    rows.map((row) => [yearMonthKey(row.year, row.month), row] as const)
  );

  let cursor = { year, month };
  for (let i = 0; i < maxLookbackMonths; i++) {
    const hit = byKey.get(yearMonthKey(cursor.year, cursor.month));
    if (hit && hasCostBase(hit)) {
      const isExact = cursor.year === year && cursor.month === month;
      return {
        contributionBase: hit.contributionBase,
        baseSalary: hit.baseSalary,
        socialSecurityCompany: hit.socialSecurityCompany,
        housingFundCompany: hit.housingFundCompany,
        adjustmentAmount: isExact ? hit.adjustmentAmount : 0,
        notes: isExact ? hit.notes : "",
        sourceYear: hit.year,
        sourceMonth: hit.month,
        isExactMonth: isExact,
      };
    }
    cursor = shiftYearMonth(cursor.year, cursor.month, -1);
  }
  return null;
}
