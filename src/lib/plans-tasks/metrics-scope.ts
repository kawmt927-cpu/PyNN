export type MetricsPeriod = "annual" | "monthly";

export type AnnualSubject = "team" | string;

export function parseMetricsPeriod(
  params: { period?: string },
  canManage: boolean
): MetricsPeriod {
  if (!canManage) return "annual";
  return params.period === "monthly" ? "monthly" : "annual";
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
