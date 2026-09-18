/** 线索池：复用 Customer.customerGrade，不建独立 Lead 表 */

export const LEAD_GRADE_VALUE = "LEAD";
/** 历史/手工可能写入的中文 key */
export const LEAD_GRADE_ALIASES = ["LEAD", "线索"] as const;

export const LEAD_GRADE_LABEL = "线索";

/** 转为意向时写入的客户等级（有意向或在建） */
export const LEAD_CONVERT_INTENT_GRADE = "STAR_3";

export function isLeadGradeValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return (LEAD_GRADE_ALIASES as readonly string[]).includes(v);
}

/** 解析 URL ?status=线索 / LEAD → 线索等级过滤值列表 */
export function resolveLeadStatusFilter(
  status: string | null | undefined
): string[] | null {
  if (!status?.trim()) return null;
  const raw = status.trim();
  if (raw === "线索" || raw === "LEAD" || raw.toLowerCase() === "lead") {
    return [...LEAD_GRADE_ALIASES];
  }
  return null;
}
