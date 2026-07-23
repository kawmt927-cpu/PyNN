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
  { value: CUSTOMER_GRADE.STAR_3, label: "有意向或在建客户", starCount: 3 },
  { value: CUSTOMER_GRADE.STAR_2, label: "已交付的客户", starCount: 2 },
  { value: CUSTOMER_GRADE.STAR_1, label: "短期无意向客户", starCount: 1 },
  { value: CUSTOMER_GRADE.NONE, label: "长期无意向客户", starCount: 0 },
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

export function getCustomerGradeLabel(
  value: string | null | undefined,
  labelMap?: Record<string, string>
): string | null {
  const normalized = normalizeCustomerGrade(value);
  if (!normalized) return null;
  if (labelMap?.[normalized]) return labelMap[normalized];
  return CUSTOMER_GRADE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
}

export function getCustomerGradeStarCount(value: string | null | undefined): number {
  const normalized = normalizeCustomerGrade(value);
  if (!normalized) return 0;
  return CUSTOMER_GRADE_OPTIONS.find((option) => option.value === normalized)?.starCount ?? 0;
}

export function getCustomerGradeOptions(): ConfigOptionItem[] {
  return CUSTOMER_GRADE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

/** 表单展示用：将客户档案等级转为下拉选中值 */
export function customerGradeFormValue(value: string | null | undefined): string {
  return normalizeCustomerGrade(value) ?? "";
}

/** 提交用：与档案等级相同时不写入 suggestedGrade，避免重复标记等级变更 */
export function customerGradeSubmitValue(
  selected: string,
  currentGrade: string | null | undefined
): string | null {
  const normalizedSelected = normalizeCustomerGrade(selected);
  if (!normalizedSelected) return null;
  const normalizedCurrent = normalizeCustomerGrade(currentGrade);
  if (normalizedSelected === normalizedCurrent) return null;
  return normalizedSelected;
}

export const DEFAULT_CUSTOMER_GRADE_CONFIG_OPTIONS = CUSTOMER_GRADE_OPTIONS.map((option, index) => ({
  category: "customer_grade" as const,
  value: option.value,
  label: option.label,
  sortOrder: index + 1,
}));
