import { getPrismaClient } from "@/lib/prisma";
import { DEFAULT_CUSTOMER_GRADE_CONFIG_OPTIONS, getCustomerGradeOptions } from "@/lib/customers/grade";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";

/** ConfigOption.category 常量 */
export const CONFIG_CATEGORY = {
  CUSTOMER_SOURCE: "customer_source",
  CUSTOMER_TYPE: "customer_type",
  CUSTOMER_GRADE: "customer_grade",
  CUSTOMER_TAG: "customer_tag",
  OPPORTUNITY_STAGE: "opportunity_stage",
  PROJECT_COST_CATEGORY: "project_cost_category",
} as const;

export type ConfigCategory = (typeof CONFIG_CATEGORY)[keyof typeof CONFIG_CATEGORY];

export const CONFIG_CATEGORY_LABELS: Record<ConfigCategory, string> = {
  [CONFIG_CATEGORY.CUSTOMER_SOURCE]: "客户来源",
  [CONFIG_CATEGORY.CUSTOMER_TYPE]: "关系类型",
  [CONFIG_CATEGORY.CUSTOMER_GRADE]: "客户等级",
  [CONFIG_CATEGORY.CUSTOMER_TAG]: "客户标签",
  [CONFIG_CATEGORY.OPPORTUNITY_STAGE]: "商机阶段",
  [CONFIG_CATEGORY.PROJECT_COST_CATEGORY]: "项目成本类别",
};

/** 可扩展的配置模块树：一级模块 → 二级字段 */
export type ConfigFieldDef = {
  category: string;
  label: string;
};

export type ConfigModuleDef = {
  id: string;
  label: string;
  /** 配置归属：销售 / 项目 / 系统（系统级仅管理员） */
  scope: "sales" | "project" | "system";
  fields: ConfigFieldDef[];
};

export const CONFIG_MODULES: ConfigModuleDef[] = [
  {
    id: "customer",
    label: "客户管理",
    scope: "sales",
    fields: [
      { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_SOURCE] },
      { category: CONFIG_CATEGORY.CUSTOMER_TYPE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_TYPE] },
      { category: CONFIG_CATEGORY.CUSTOMER_TAG, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_TAG] },
      { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.OPPORTUNITY_STAGE] },
    ],
  },
  {
    id: "project",
    label: "项目管理",
    scope: "project",
    fields: [
      {
        category: CONFIG_CATEGORY.PROJECT_COST_CATEGORY,
        label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.PROJECT_COST_CATEGORY],
      },
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
  const defaultCategories = [...new Set(DEFAULT_CUSTOMER_FIELD_OPTIONS.map((opt) => opt.category))];
  await Promise.all(defaultCategories.map((category) => ensureDefaultConfigOptions(category)));
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
  await ensureDefaultConfigOptions(category);
  return db.configOption.findMany({
    where: { category, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { value: true, label: true },
  });
}

async function ensureDefaultConfigOptions(category: string) {
  const db = getPrismaClient();
  const count = await db.configOption.count({ where: { category } });
  if (count > 0) return;

  const defaults = DEFAULT_CUSTOMER_FIELD_OPTIONS.filter((opt) => opt.category === category);
  if (defaults.length === 0) return;

  for (const opt of defaults) {
    await db.configOption.upsert({
      where: { category_value: { category: opt.category, value: opt.value } },
      update: {},
      create: {
        category: opt.category,
        value: opt.value,
        label: opt.label,
        sortOrder: opt.sortOrder,
      },
    });
  }
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
  ...DEFAULT_CUSTOMER_GRADE_CONFIG_OPTIONS,
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "INITIAL_VISIT", label: "初访", sortOrder: 1 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "NEEDS_CONFIRM", label: "需求确认", sortOrder: 2 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "PROPOSAL", label: "方案", sortOrder: 3 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "QUOTATION", label: "报价", sortOrder: 4 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "NEGOTIATION", label: "谈判", sortOrder: 5 },
] as const;

export async function loadCustomerFormOptions() {
  const [sourceOptions, typeOptions, tagOptions] = await Promise.all([
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE),
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
    getCustomerTagDefinitions(),
  ]);
  return {
    sourceOptions,
    typeOptions,
    gradeOptions: getCustomerGradeOptions(),
    tagOptions,
  };
}

export async function loadCustomerFieldLabelMaps() {
  const maps = await getConfigOptionMaps([
    CONFIG_CATEGORY.CUSTOMER_SOURCE,
    CONFIG_CATEGORY.CUSTOMER_TYPE,
  ]);
  maps[CONFIG_CATEGORY.CUSTOMER_GRADE] = Object.fromEntries(
    getCustomerGradeOptions().map((option) => [option.value, option.label])
  );
  return maps;
}
