export type CostComposition = {
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  bonus: number;
  penaltyAmount: number;
  monthAdjustment: number;
};

function money(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function money0(value: number | null | undefined): number {
  return money(value) ?? 0;
}

export function serializeCopiedSnapshot(c: CostComposition): string {
  return JSON.stringify({
    contributionBase: money(c.contributionBase),
    baseSalary: money(c.baseSalary),
    socialSecurityCompany: money(c.socialSecurityCompany),
    housingFundCompany: money(c.housingFundCompany),
    bonus: money0(c.bonus),
    penaltyAmount: money0(c.penaltyAmount),
    monthAdjustment: money0(c.monthAdjustment),
  });
}

export function parseCopiedSnapshot(raw: string | null | undefined): CostComposition | null {
  if (!raw?.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const n = (v: unknown) => {
      if (v == null || v === "") return null;
      const x = typeof v === "number" ? v : Number(v);
      return Number.isFinite(x) ? x : null;
    };
    return {
      contributionBase: n(obj.contributionBase),
      baseSalary: n(obj.baseSalary),
      socialSecurityCompany: n(obj.socialSecurityCompany),
      housingFundCompany: n(obj.housingFundCompany),
      bonus: n(obj.bonus) ?? 0,
      penaltyAmount: n(obj.penaltyAmount) ?? 0,
      monthAdjustment: n(obj.monthAdjustment) ?? 0,
    };
  } catch {
    return null;
  }
}

function deltaMark(label: string, from: number | null, to: number | null): string | null {
  const a = from ?? 0;
  const b = to ?? 0;
  const d = Math.round((b - a) * 100) / 100;
  if (Math.abs(d) < 0.005) return null;
  if (d > 0) return `${label}增加了 ${d}`;
  return `${label}减少了 ${Math.abs(d)}`;
}

/** 相对复制来源构成生成增减说明 */
export function buildChangeSummary(
  current: CostComposition,
  copied: CostComposition | null
): string | null {
  if (!copied) {
    const parts: string[] = [];
    if (money0(current.bonus) > 0) parts.push(`奖金 ${money0(current.bonus)}`);
    if (money0(current.penaltyAmount) > 0) parts.push(`扣罚 ${money0(current.penaltyAmount)}`);
    return parts.length > 0 ? parts.join("；") : null;
  }
  const marks = [
    deltaMark("缴费基数", copied.contributionBase, current.contributionBase),
    deltaMark("基本工资", copied.baseSalary, current.baseSalary),
    deltaMark("社保公司承担", copied.socialSecurityCompany, current.socialSecurityCompany),
    deltaMark("公积金公司承担", copied.housingFundCompany, current.housingFundCompany),
    deltaMark("奖金", copied.bonus, current.bonus),
    deltaMark("扣罚", copied.penaltyAmount, current.penaltyAmount),
    deltaMark("本月调整", copied.monthAdjustment, current.monthAdjustment),
  ].filter((x): x is string => Boolean(x));
  return marks.length > 0 ? marks.join("；") : null;
}
