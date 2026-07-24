import type { Customer, CustomerCategory } from "@prisma/client";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { labelForConfig } from "@/lib/config-options";

export type CustomerEditNext = {
  name: string;
  category: CustomerCategory;
  hospitalLevel: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  bedCount: number | null;
  existingSystem: string | null;
  source: string | null;
  customerType: string | null;
  customerGrade: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  assistantOwnerIds: string[];
  assistantNames: string[];
  tagValues: string[];
  tagLabels: string[];
};

type ExistingCustomer = Pick<
  Customer,
  | "name"
  | "category"
  | "hospitalLevel"
  | "province"
  | "city"
  | "district"
  | "bedCount"
  | "existingSystem"
  | "source"
  | "customerType"
  | "customerGrade"
  | "notes"
  | "ownerId"
> & {
  owner: { name: string } | null;
  assistantOwners: { userId: string; user: { name: string } }[];
  tags: { tagValue: string }[];
};

type LabelMaps = {
  typeLabels: Record<string, string>;
  gradeLabels: Record<string, string>;
  channelGradeLabels: Record<string, string>;
  hospitalLevelLabels: Record<string, string>;
  sourceLabels: Record<string, string>;
  tagLabelByValue: Record<string, string>;
  isChannelType: (customerType: string | null | undefined) => boolean;
};

function normalizeText(value: string | null | undefined) {
  const trimmed =
    value
      ?.replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim() ?? "";
  return trimmed || null;
}

/** 多行字段变更：避免把整段备注嵌进一行后看起来像「多条变更」 */
function pushChange(
  changes: string[],
  label: string,
  before: string | null,
  after: string | null
) {
  if (before === after) return;
  const multiline =
    (before?.includes("\n") ?? false) || (after?.includes("\n") ?? false);
  if (multiline) {
    changes.push(`${label}：\n  原：${before ?? "空"}\n  新：${after ?? "空"}`);
    return;
  }
  changes.push(`${label}：${before ?? "空"} → ${after ?? "空"}`);
}

function formatList(values: string[]) {
  if (values.length === 0) return "空";
  return values.join("、");
}

function sortedJoin(ids: string[]) {
  return [...ids].sort().join(",");
}

export function buildCustomerEditChanges(
  existing: ExistingCustomer,
  next: CustomerEditNext,
  labels: LabelMaps
): string[] {
  const changes: string[] = [];

  pushChange(changes, "客户名称", existing.name.trim(), next.name.trim());

  if (existing.category !== next.category) {
    pushChange(
      changes,
      "类别",
      CUSTOMER_CATEGORY_LABELS[existing.category],
      CUSTOMER_CATEGORY_LABELS[next.category]
    );
  }

  pushChange(
    changes,
    "医院等级",
    normalizeText(existing.hospitalLevel)
      ? labelForConfig(labels.hospitalLevelLabels, existing.hospitalLevel!)
      : null,
    normalizeText(next.hospitalLevel)
      ? labelForConfig(labels.hospitalLevelLabels, next.hospitalLevel!)
      : null
  );

  pushChange(changes, "省", normalizeText(existing.province), normalizeText(next.province));
  pushChange(changes, "市", normalizeText(existing.city), normalizeText(next.city));
  pushChange(changes, "区/县", normalizeText(existing.district), normalizeText(next.district));

  if ((existing.bedCount ?? null) !== (next.bedCount ?? null)) {
    pushChange(
      changes,
      "床位数",
      existing.bedCount != null ? String(existing.bedCount) : null,
      next.bedCount != null ? String(next.bedCount) : null
    );
  }

  pushChange(
    changes,
    "现有系统",
    normalizeText(existing.existingSystem),
    normalizeText(next.existingSystem)
  );

  pushChange(
    changes,
    "来源",
    normalizeText(existing.source)
      ? labelForConfig(labels.sourceLabels, existing.source!)
      : null,
    normalizeText(next.source) ? labelForConfig(labels.sourceLabels, next.source!) : null
  );

  pushChange(
    changes,
    "关系类型",
    normalizeText(existing.customerType)
      ? labelForConfig(labels.typeLabels, existing.customerType!)
      : null,
    normalizeText(next.customerType)
      ? labelForConfig(labels.typeLabels, next.customerType!)
      : null
  );

  const beforeGradeMap = labels.isChannelType(existing.customerType)
    ? labels.channelGradeLabels
    : labels.gradeLabels;
  const afterGradeMap = labels.isChannelType(next.customerType)
    ? labels.channelGradeLabels
    : labels.gradeLabels;
  pushChange(
    changes,
    "等级",
    normalizeText(existing.customerGrade)
      ? labelForConfig(beforeGradeMap, existing.customerGrade!)
      : null,
    normalizeText(next.customerGrade)
      ? labelForConfig(afterGradeMap, next.customerGrade!)
      : null
  );

  pushChange(changes, "备注", normalizeText(existing.notes), normalizeText(next.notes));

  if (existing.ownerId !== next.ownerId) {
    pushChange(changes, "负责人", existing.owner?.name ?? "公海池", next.ownerName ?? "公海池");
  }

  const beforeAssistantIds = existing.assistantOwners.map((a) => a.userId);
  if (sortedJoin(beforeAssistantIds) !== sortedJoin(next.assistantOwnerIds)) {
    pushChange(
      changes,
      "协助负责人",
      formatList(existing.assistantOwners.map((a) => a.user.name)),
      formatList(next.assistantNames)
    );
  }

  const beforeTagValues = existing.tags.map((t) => t.tagValue);
  if (sortedJoin(beforeTagValues) !== sortedJoin(next.tagValues)) {
    const beforeLabels = beforeTagValues.map(
      (v) => labels.tagLabelByValue[v] ?? v
    );
    pushChange(changes, "标签", formatList(beforeLabels), formatList(next.tagLabels));
  }

  return changes;
}
