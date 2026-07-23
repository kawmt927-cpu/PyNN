import { CUSTOMER_GRADE, getCustomerGradeLabel, normalizeCustomerGrade, type CustomerGradeValue } from "@/lib/customers/grade";
import type { ConfigOptionItem } from "@/lib/config-options";

export function resolveNoneGradeLabel(
  gradeOptions?: ConfigOptionItem[],
  labelMap?: Record<string, string>
): string {
  const fromOptions = gradeOptions?.find((option) => option.value === CUSTOMER_GRADE.NONE)?.label;
  if (fromOptions) return fromOptions;
  return getCustomerGradeLabel(CUSTOMER_GRADE.NONE, labelMap) ?? "长期无意向客户";
}

export function getNextFollowUpPlanHintRequired(noneGradeLabel: string): string {
  return `下次往来计划为必填。若将客户等级降为「${noneGradeLabel}」，可不填写。`;
}

export function getNextFollowUpPlanHintExempt(noneGradeLabel: string): string {
  return `客户为「${noneGradeLabel}」，下次往来计划可不填。`;
}

export function resolveEffectiveCustomerGrade(
  suggestedGrade: string | null | undefined,
  currentCustomerGrade?: string | null
): CustomerGradeValue | null {
  const suggested = normalizeCustomerGrade(suggestedGrade);
  if (suggested) return suggested;
  return normalizeCustomerGrade(currentCustomerGrade);
}

export function isNextFollowUpPlanExempt(
  suggestedGrade: string | null | undefined,
  currentCustomerGrade?: string | null
): boolean {
  return resolveEffectiveCustomerGrade(suggestedGrade, currentCustomerGrade) === CUSTOMER_GRADE.NONE;
}

export function validateNextFollowUpPlan(
  suggestedGrade: string | null | undefined,
  nextFollowUpAt: string | null | undefined,
  nextFollowUpMethod: string | null | undefined,
  currentCustomerGrade?: string | null,
  nextFollowUpContent?: string | null | undefined
): string | null {
  if (isNextFollowUpPlanExempt(suggestedGrade, currentCustomerGrade)) return null;
  if (!nextFollowUpMethod?.trim()) return "请选择下次往来计划方式";
  if (!nextFollowUpAt?.trim()) return "请填写下次往来计划时间";
  if (!nextFollowUpContent?.trim()) return "请填写下次往来目的和内容";
  return null;
}

export function pendingFollowUpPlanContent(
  nextFollowUpContent: string | null | undefined,
  fallbackContent: string
): string {
  return nextFollowUpContent?.trim() || fallbackContent;
}
