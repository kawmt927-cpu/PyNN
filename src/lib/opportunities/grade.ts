import type { ConfigOptionItem } from "@/lib/config-options";

/** 商机等级默认值：可在系统配置 opportunity_grade 中改文案与周期 */
export const OPPORTUNITY_GRADE = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
} as const;

export type OpportunityGradeValue =
  (typeof OPPORTUNITY_GRADE)[keyof typeof OPPORTUNITY_GRADE];

export const OPPORTUNITY_GRADE_OPTIONS: Array<{
  value: OpportunityGradeValue;
  label: string;
  starCount: number;
  followUpIntervalDays: number;
}> = [
  { value: OPPORTUNITY_GRADE.P0, label: "P0 · 最高优先", starCount: 3, followUpIntervalDays: 7 },
  { value: OPPORTUNITY_GRADE.P1, label: "P1 · 高优先", starCount: 2, followUpIntervalDays: 14 },
  { value: OPPORTUNITY_GRADE.P2, label: "P2 · 中优先", starCount: 1, followUpIntervalDays: 30 },
  { value: OPPORTUNITY_GRADE.P3, label: "P3 · 低优先", starCount: 0, followUpIntervalDays: 60 },
];

const DEFAULT_INTERVALS: Record<string, number> = Object.fromEntries(
  OPPORTUNITY_GRADE_OPTIONS.map((o) => [o.value, o.followUpIntervalDays])
);

export function isOpportunityGradeValue(value: string): value is OpportunityGradeValue {
  return OPPORTUNITY_GRADE_OPTIONS.some((option) => option.value === value);
}

export function normalizeOpportunityGrade(
  value: string | null | undefined
): OpportunityGradeValue | null {
  if (!value) return null;
  return isOpportunityGradeValue(value) ? value : null;
}

export function assertOpportunityGrade(
  value: string | null | undefined
): OpportunityGradeValue {
  if (!value?.trim()) throw new Error("请选择商机等级");
  const normalized = normalizeOpportunityGrade(value);
  if (!normalized) throw new Error("无效的商机等级");
  return normalized;
}

export function getOpportunityGradeLabel(
  value: string | null | undefined,
  labelMap?: Record<string, string>
): string | null {
  const normalized = normalizeOpportunityGrade(value);
  if (!normalized) return null;
  if (labelMap?.[normalized]) return labelMap[normalized];
  return (
    OPPORTUNITY_GRADE_OPTIONS.find((option) => option.value === normalized)?.label ??
    normalized
  );
}

export function getOpportunityGradeStarCount(value: string | null | undefined): number {
  const normalized = normalizeOpportunityGrade(value);
  if (!normalized) return 0;
  return (
    OPPORTUNITY_GRADE_OPTIONS.find((option) => option.value === normalized)?.starCount ?? 0
  );
}

export function getOpportunityGradeOptions(): ConfigOptionItem[] {
  return OPPORTUNITY_GRADE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

export const DEFAULT_OPPORTUNITY_GRADE_CONFIG_OPTIONS = OPPORTUNITY_GRADE_OPTIONS.map(
  (option, index) => ({
    category: "opportunity_grade" as const,
    value: option.value,
    label: option.label,
    sortOrder: index + 1,
    color: index < 2 ? "#ec4899" : index === 2 ? "#f9a8d4" : "#fce7f3",
    enabled: true,
    followUpIntervalDays: option.followUpIntervalDays,
  })
);

export function defaultOpportunityGradeIntervalDays(
  value: string | null | undefined
): number | null {
  const normalized = normalizeOpportunityGrade(value);
  if (!normalized) return null;
  return DEFAULT_INTERVALS[normalized] ?? null;
}
