import { prisma } from "@/lib/prisma";
import { CONFIG_CATEGORY } from "@/lib/config-options";
import {
  defaultOpportunityGradeIntervalDays,
  normalizeOpportunityGrade,
  OPPORTUNITY_GRADE_OPTIONS,
} from "@/lib/opportunities/grade";

const DEFAULT_INTERVALS: Record<string, number> = Object.fromEntries(
  OPPORTUNITY_GRADE_OPTIONS.map((option) => [option.value, option.followUpIntervalDays])
);

export async function getOpportunityGradeIntervalMap(): Promise<Map<string, number>> {
  const rows = await prisma.configOption.findMany({
    where: { category: CONFIG_CATEGORY.OPPORTUNITY_GRADE, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    const days =
      row.followUpIntervalDays ??
      DEFAULT_INTERVALS[row.value] ??
      defaultOpportunityGradeIntervalDays(row.value);
    if (days != null && days > 0) {
      map.set(row.value, days);
    }
  }

  for (const [value, days] of Object.entries(DEFAULT_INTERVALS)) {
    if (!map.has(value)) map.set(value, days);
  }

  return map;
}

export function resolveOpportunityGradeIntervalDays(
  grade: string | null | undefined,
  intervalMap: Map<string, number>
): number | null {
  const normalized = normalizeOpportunityGrade(grade);
  if (!normalized) return null;
  return intervalMap.get(normalized) ?? DEFAULT_INTERVALS[normalized] ?? null;
}
