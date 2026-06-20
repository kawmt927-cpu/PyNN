import type { ConfigOptionItem } from "@/lib/config-options";

export const CUSTOMER_GRADE = {
  STAR_3: "STAR_3",
  STAR_2: "STAR_2",
  STAR_1: "STAR_1",
  NONE: "NONE",
} as const;

export type CustomerGradeValue = (typeof CUSTOMER_GRADE)[keyof typeof CUSTOMER_GRADE];

export const CUSTOMER_GRADE_OPTIONS: Array<{
  value: CustomerGradeValue;
  label: string;
  starCount: number;
}> = [
  { value: CUSTOMER_GRADE.STAR_3, label: "三星", starCount: 3 },
  { value: CUSTOMER_GRADE.STAR_2, label: "两星", starCount: 2 },
  { value: CUSTOMER_GRADE.STAR_1, label: "一星", starCount: 1 },
  { value: CUSTOMER_GRADE.NONE, label: "未评级", starCount: 0 },
];

const LEGACY_GRADE_MAP: Record<string, CustomerGradeValue> = {
  INTERESTED: CUSTOMER_GRADE.STAR_3,
  POTENTIAL: CUSTOMER_GRADE.STAR_2,
  NOT_INTERESTED: CUSTOMER_GRADE.NONE,
};

export function isCustomerGradeValue(value: string): value is CustomerGradeValue {
  return CUSTOMER_GRADE_OPTIONS.some((option) => option.value === value);
}

export function normalizeCustomerGrade(value: string | null | undefined): CustomerGradeValue | null {
  if (!value) return null;
  if (isCustomerGradeValue(value)) return value;
  return LEGACY_GRADE_MAP[value] ?? null;
}

export function assertCustomerGrade(value: string | null | undefined): CustomerGradeValue | null {
  if (!value) return null;
  const normalized = normalizeCustomerGrade(value);
  if (!normalized) {
    throw new Error("无效的客户等级");
  }
  return normalized;
}

export function requireCustomerGrade(value: string | null | undefined): CustomerGradeValue {
  const normalized = assertCustomerGrade(value);
  if (!normalized) {
    throw new Error("请选择客户等级");
  }
  return normalized;
}

export function getCustomerGradeLabel(value: string | null | undefined): string | null {
  const normalized = normalizeCustomerGrade(value);
  if (!normalized) return null;
  return CUSTOMER_GRADE_OPTIONS.find((option) => option.value === normalized)?.label ?? null;
}

export function getCustomerGradeOptions(): ConfigOptionItem[] {
  return CUSTOMER_GRADE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

export const DEFAULT_CUSTOMER_GRADE_CONFIG_OPTIONS = CUSTOMER_GRADE_OPTIONS.map((option, index) => ({
  category: "customer_grade" as const,
  value: option.value,
  label: option.label,
  sortOrder: index + 1,
}));
