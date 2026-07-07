export type MetricsPeriod = "annual" | "monthly";

export type AnnualSubject = "team" | string;

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

export function parseAnnualSubject(
  params: { subject?: string; userId?: string },
  salesUserIds: string[]
): AnnualSubject {
  const raw = params.subject ?? params.userId;
  if (!raw || raw === "team" || raw === "all") return "team";
  if (salesUserIds.includes(raw)) return raw;
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
