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
  const content = nextFollowUpContent?.trim() ?? "";
  if (!content) return "请填写下次往来目的和内容";
  // 拒绝仅标点/逗号占位（如「，，，，」），避免待跟进列表出现无意义内容
  if (!hasMeaningfulFollowUpText(content)) {
    return "下次往来内容请写具体目的，不要只填标点或逗号";
  }
  return null;
}

/** 是否含有效汉字/字母/数字（排除纯标点占位） */
export function hasMeaningfulFollowUpText(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  return /[\u4e00-\u9fffA-Za-z0-9]/.test(text);
}

export function pendingFollowUpPlanContent(
  nextFollowUpContent: string | null | undefined,
  fallbackContent: string
): string {
  const primary = nextFollowUpContent?.trim() || "";
  if (primary && hasMeaningfulFollowUpText(primary)) return primary;
  const fallback = fallbackContent?.trim() || "";
  if (fallback && hasMeaningfulFollowUpText(fallback)) return fallback;
  if (primary) return "（未填写具体内容）";
  return fallback || "（未填写具体内容）";
}
