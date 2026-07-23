export type MetricsPeriod = "annual" | "monthly";

/** team=全员汇总；others=非普通销售合计；其余为普通销售 userId */
export type AnnualSubject = "team" | "others" | string;

export const ANNUAL_SUBJECT_OTHERS = "others" as const;

const METRICS_YEAR_MIN = 2020;

export function parseMetricsPeriod(
  params: { period?: string },
  canManage: boolean
): MetricsPeriod {
  if (!canManage) return "annual";
  return params.period === "annual" ? "annual" : "monthly";
}

export function parseMetricsYear(
  params: { year?: string },
  now = new Date()
): number {
  const current = now.getFullYear();
  const parsed = Number.parseInt(params.year ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= METRICS_YEAR_MIN && parsed <= current) {
    return parsed;
  }
  return current;
}

export function parseMetricsMonth(
  params: { month?: string },
  year: number,
  now = new Date()
): number {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const parsed = Number.parseInt(params.month ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return year === currentYear ? currentMonth : 12;
  }

  if (year === currentYear && parsed > currentMonth) {
    return currentMonth;
  }

  return parsed;
}

export function metricsYearOptions(now = new Date()): number[] {
  const current = now.getFullYear();
  return Array.from({ length: current - METRICS_YEAR_MIN + 1 }, (_, index) => current - index);
}

/** 手机端可选年份：今年与去年 */
export function metricsRecentYearOptions(now = new Date()): number[] {
  const current = now.getFullYear();
  return [current, current - 1];
}

/** 手机端年份：仅允许今年或去年，非法则回退今年 */
export function parseMetricsYearRecent(
  params: { year?: string },
  now = new Date()
): number {
  const allowed = metricsRecentYearOptions(now);
  const parsed = Number.parseInt(params.year ?? "", 10);
  if (Number.isFinite(parsed) && allowed.includes(parsed)) {
    return parsed;
  }
  return allowed[0]!;
}

export function parseAnnualSubject(
  params: { subject?: string; userId?: string },
  /** 普通销售（role=SALES）的 id 列表 */
  regularSalesUserIds: string[],
  options?: { hasOthers?: boolean }
): AnnualSubject {
  const raw = params.subject ?? params.userId;
  if (!raw || raw === "team" || raw === "all") return "team";
  if (raw === ANNUAL_SUBJECT_OTHERS) {
    return options?.hasOthers ? ANNUAL_SUBJECT_OTHERS : "team";
  }
  if (regularSalesUserIds.includes(raw)) return raw;
  return "team";
}

export function resolveMonthlyUserId(
  params: { monthlyUserId?: string },
  salesUserIds: string[],
  fallbackUserId: string
): string {
  if (params.monthlyUserId && salesUserIds.includes(params.monthlyUserId)) {
    return params.monthlyUserId;
  }
  return salesUserIds[0] ?? fallbackUserId;
}
