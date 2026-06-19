import { getPrismaClient } from "@/lib/prisma";

/** ConfigOption.category 常量 */
export const CONFIG_CATEGORY = {
  CUSTOMER_SOURCE: "customer_source",
  CUSTOMER_TYPE: "customer_type",
  CUSTOMER_GRADE: "customer_grade",
} as const;

export type ConfigCategory = (typeof CONFIG_CATEGORY)[keyof typeof CONFIG_CATEGORY];

export const CONFIG_CATEGORY_LABELS: Record<ConfigCategory, string> = {
  [CONFIG_CATEGORY.CUSTOMER_SOURCE]: "客户来源",
  [CONFIG_CATEGORY.CUSTOMER_TYPE]: "客户类型",
  [CONFIG_CATEGORY.CUSTOMER_GRADE]: "客户等级",
};

/** 可扩展的配置模块树：一级模块 → 二级字段 */
export type ConfigFieldDef = {
  category: string;
  label: string;
};

export type ConfigModuleDef = {
  id: string;
  label: string;
  fields: ConfigFieldDef[];
};

export const CONFIG_MODULES: ConfigModuleDef[] = [
  {
    id: "customer",
    label: "客户管理",
    fields: [
      { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_SOURCE] },
      { category: CONFIG_CATEGORY.CUSTOMER_TYPE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_TYPE] },
      { category: CONFIG_CATEGORY.CUSTOMER_GRADE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_GRADE] },
    ],
  },
];

export function resolveConfigField(moduleId: string, category: string | undefined) {
  const mod = CONFIG_MODULES.find((m) => m.id === moduleId) ?? CONFIG_MODULES[0];
  const field =
    mod.fields.find((f) => f.category === category) ?? mod.fields[0];
  return { module: mod, field };
}

export async function getAllConfigOptionsGrouped() {
  const db = getPrismaClient();
  const rows = await db.configOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row);
  }
  return grouped;
}

export type ConfigOptionItem = { value: string; label: string };

export function generateConfigOptionValue(category: string): string {
  const prefix = category.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 24);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}_${suffix}`;
}

export async function getConfigOptions(category: string): Promise<ConfigOptionItem[]> {
  const db = getPrismaClient();
  return db.configOption.findMany({
    where: { category, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { value: true, label: true },
  });
}

export async function getAllConfigOptions(category: string) {
  const db = getPrismaClient();
  return db.configOption.findMany({
    where: { category },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function getConfigOptionMaps(categories: string[]) {
  const db = getPrismaClient();
  const rows = await db.configOption.findMany({
    where: { category: { in: categories }, enabled: true },
    select: { category: true, value: true, label: true },
  });
  const maps: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    if (!maps[row.category]) maps[row.category] = {};
    maps[row.category][row.value] = row.label;
  }
  return maps;
}

export function labelForConfig(
  map: Record<string, string> | undefined,
  value: string | null | undefined
): string {
  if (!value) return "—";
  return map?.[value] ?? value;
}

export async function assertConfigValue(category: string, value: string | null | undefined) {
  if (!value) return null;
  const db = getPrismaClient();
  const option = await db.configOption.findFirst({
    where: { category, value, enabled: true },
  });
  if (!option) throw new Error("所选选项无效或已停用");
  return value;
}

/** 客户字段默认选项（seed 与空库兜底） */
export const DEFAULT_CUSTOMER_FIELD_OPTIONS = [
  { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, value: "ACTIVE_DEV", label: "主动开发", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, value: "COMPANY_ASSIGN", label: "公司分配", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, value: "CHANNEL_INTRO", label: "渠道介绍", sortOrder: 3 },
  { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, value: "LEAD_CONVERT", label: "线索转化", sortOrder: 4 },
  { category: CONFIG_CATEGORY.CUSTOMER_TYPE, value: "DIRECT", label: "直接客户", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CUSTOMER_TYPE, value: "CHANNEL", label: "渠道", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CUSTOMER_TYPE, value: "PARTNER", label: "合作伙伴", sortOrder: 3 },
  { category: CONFIG_CATEGORY.CUSTOMER_GRADE, value: "INTERESTED", label: "有意向客户", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CUSTOMER_GRADE, value: "NOT_INTERESTED", label: "无意向客户", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CUSTOMER_GRADE, value: "POTENTIAL", label: "潜在客户", sortOrder: 3 },
] as const;

export async function loadCustomerFormOptions() {
  const [sourceOptions, typeOptions, gradeOptions] = await Promise.all([
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE),
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_GRADE),
  ]);
  return { sourceOptions, typeOptions, gradeOptions };
}

export async function loadCustomerFieldLabelMaps() {
  return getConfigOptionMaps([
    CONFIG_CATEGORY.CUSTOMER_SOURCE,
    CONFIG_CATEGORY.CUSTOMER_TYPE,
    CONFIG_CATEGORY.CUSTOMER_GRADE,
  ]);
}
