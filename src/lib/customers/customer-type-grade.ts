import type { ConfigOptionItem } from "@/lib/config-options";
import {
  CUSTOMER_GRADE,
  CUSTOMER_GRADE_OPTIONS,
  type CustomerGradeValue,
  assertCustomerGrade,
  requireCustomerGrade,
} from "@/lib/customers/grade";

/** 关系类型 canonical value（与默认 ConfigOption 一致） */
export const CUSTOMER_RELATION_TYPE = {
  DIRECT: "DIRECT",
  CHANNEL: "CHANNEL",
  PARTNER: "PARTNER",
} as const;

export type CustomerRelationKind = "direct" | "channel" | "partner" | "other";
export type CustomerGradeTone = "amber" | "blue";

type TypeOptionLike = { value: string; label: string };

/**
 * 按 value / 显示名称识别关系类型。
 * 历史数据中「渠道」可能被重建为 CUSTOMER_TYPE_xxx，不能只认 CHANNEL。
 */
export function classifyCustomerRelationType(
  customerType: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
): CustomerRelationKind {
  if (!customerType?.trim()) return "other";
  const value = customerType.trim();

  if (value === CUSTOMER_RELATION_TYPE.DIRECT) return "direct";
  if (value === CUSTOMER_RELATION_TYPE.CHANNEL) return "channel";
  if (value === CUSTOMER_RELATION_TYPE.PARTNER) return "partner";

  const label = resolveTypeLabel(value, typeOptionsOrLabelMap);
  if (label) return classifyRelationLabel(label);

  return "other";
}

function resolveTypeLabel(
  value: string,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
): string | undefined {
  if (!typeOptionsOrLabelMap) return undefined;
  if (Array.isArray(typeOptionsOrLabelMap)) {
    return typeOptionsOrLabelMap.find((item) => item.value === value)?.label;
  }
  return typeOptionsOrLabelMap[value];
}

export function classifyRelationLabel(label: string): CustomerRelationKind {
  const text = label.trim();
  if (!text) return "other";
  if (text === "渠道" || text.startsWith("渠道")) return "channel";
  if (text.includes("直接")) return "direct";
  if (text.includes("合作") || text.includes("伙伴")) return "partner";
  return "other";
}

export function isDirectCustomerType(
  customerType: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
) {
  return classifyCustomerRelationType(customerType, typeOptionsOrLabelMap) === "direct";
}

export function isChannelCustomerType(
  customerType: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
) {
  return classifyCustomerRelationType(customerType, typeOptionsOrLabelMap) === "channel";
}

/** 医院客户：关系类型固定为直接客户 */
export function categoryLocksToDirectCustomer(
  category: string | null | undefined
): boolean {
  return category === "HOSPITAL";
}

/** 解析「直接客户」配置 value（兼容历史非 DIRECT 的 value） */
export function resolveDirectCustomerTypeValue(
  typeOptions?: TypeOptionLike[] | null
): string {
  if (typeOptions?.length) {
    const byValue = typeOptions.find((item) => item.value === CUSTOMER_RELATION_TYPE.DIRECT);
    if (byValue) return byValue.value;
    const byLabel = typeOptions.find(
      (item) => classifyRelationLabel(item.label) === "direct"
    );
    if (byLabel) return byLabel.value;
  }
  return CUSTOMER_RELATION_TYPE.DIRECT;
}

/** 按客户类别强制关系类型（医院 → 直接客户） */
export function enforceCustomerTypeForCategory(
  category: string | null | undefined,
  customerType: string | null | undefined,
  typeOptions?: TypeOptionLike[] | null
): string {
  if (categoryLocksToDirectCustomer(category)) {
    return resolveDirectCustomerTypeValue(typeOptions);
  }
  return customerType?.trim() ?? "";
}

/** 直接客户 / 渠道需要等级；合作伙伴等不需要 */
export function customerTypeRequiresGrade(
  customerType: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
) {
  const kind = classifyCustomerRelationType(customerType, typeOptionsOrLabelMap);
  return kind === "direct" || kind === "channel";
}

export function gradeToneForCustomerType(
  customerType: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
): CustomerGradeTone {
  return isChannelCustomerType(customerType, typeOptionsOrLabelMap) ? "blue" : "amber";
}

export const DEFAULT_CHANNEL_CUSTOMER_GRADE_CONFIG_OPTIONS = [
  {
    category: "channel_customer_grade" as const,
    value: CUSTOMER_GRADE.STAR_3,
    label: "核心渠道",
    sortOrder: 1,
  },
  {
    category: "channel_customer_grade" as const,
    value: CUSTOMER_GRADE.STAR_2,
    label: "重点渠道",
    sortOrder: 2,
  },
  {
    category: "channel_customer_grade" as const,
    value: CUSTOMER_GRADE.STAR_1,
    label: "一般渠道",
    sortOrder: 3,
  },
  {
    category: "channel_customer_grade" as const,
    value: CUSTOMER_GRADE.NONE,
    label: "待评估渠道",
    sortOrder: 4,
  },
];

export function resolveCustomerGradeForType(
  customerType: string | null | undefined,
  customerGrade: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
): CustomerGradeValue | null {
  if (!customerTypeRequiresGrade(customerType, typeOptionsOrLabelMap)) return null;
  return assertCustomerGrade(customerGrade);
}

export function requireCustomerGradeForType(
  customerType: string | null | undefined,
  customerGrade: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
): CustomerGradeValue | null {
  if (!customerTypeRequiresGrade(customerType, typeOptionsOrLabelMap)) return null;
  return requireCustomerGrade(customerGrade);
}

export function defaultGradeOptionsForType(
  customerType: string | null | undefined,
  typeOptionsOrLabelMap?: TypeOptionLike[] | Record<string, string> | null
): ConfigOptionItem[] {
  if (isChannelCustomerType(customerType, typeOptionsOrLabelMap)) {
    return DEFAULT_CHANNEL_CUSTOMER_GRADE_CONFIG_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }
  return CUSTOMER_GRADE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

/** 将「渠道/直接客户/合作伙伴」配置 value 归一到 canonical，并同步客户表 */
export async function normalizeCanonicalCustomerTypeValues() {
  const { prisma } = await import("@/lib/prisma");
  const { CONFIG_CATEGORY } = await import("@/lib/config-options");

  const rows = await prisma.configOption.findMany({
    where: { category: CONFIG_CATEGORY.CUSTOMER_TYPE },
  });

  for (const row of rows) {
    const kind = classifyRelationLabel(row.label);
    const canonical =
      kind === "channel"
        ? CUSTOMER_RELATION_TYPE.CHANNEL
        : kind === "direct"
          ? CUSTOMER_RELATION_TYPE.DIRECT
          : kind === "partner"
            ? CUSTOMER_RELATION_TYPE.PARTNER
            : null;
    if (!canonical || row.value === canonical) continue;

    const conflict = rows.find((item) => item.id !== row.id && item.value === canonical);
    if (conflict) continue;

    await prisma.$transaction(async (tx) => {
      await tx.customer.updateMany({
        where: { customerType: row.value },
        data: { customerType: canonical },
      });
      await tx.configOption.update({
        where: { id: row.id },
        data: { value: canonical },
      });
    });
    row.value = canonical;
  }
}
