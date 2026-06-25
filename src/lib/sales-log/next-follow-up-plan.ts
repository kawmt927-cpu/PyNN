import { CUSTOMER_GRADE, normalizeCustomerGrade, type CustomerGradeValue } from "@/lib/customers/grade";

export const NEXT_FOLLOW_UP_PLAN_HINT_REQUIRED =
  "下次往来计划为必填。若将客户等级降为未评级（灰色星），可不填写。";

export const NEXT_FOLLOW_UP_PLAN_HINT_EXEMPT =
  "客户为未评级（灰色星），下次往来计划可不填。";

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
  currentCustomerGrade?: string | null
): string | null {
  if (isNextFollowUpPlanExempt(suggestedGrade, currentCustomerGrade)) return null;
  if (!nextFollowUpMethod?.trim()) return "请选择下次往来计划方式";
  if (!nextFollowUpAt?.trim()) return "请填写下次往来计划时间";
  return null;
}
