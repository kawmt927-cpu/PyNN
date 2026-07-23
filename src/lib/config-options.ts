import { getPrismaClient } from "@/lib/prisma";
import { DEFAULT_CUSTOMER_GRADE_CONFIG_OPTIONS, getCustomerGradeOptions } from "@/lib/customers/grade";
import {
  DEFAULT_CHANNEL_CUSTOMER_GRADE_CONFIG_OPTIONS,
  isChannelCustomerType,
} from "@/lib/customers/customer-type-grade";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";

/** ConfigOption.category 常量 */
export const CONFIG_CATEGORY = {
  CUSTOMER_SOURCE: "customer_source",
  CUSTOMER_TYPE: "customer_type",
  CUSTOMER_GRADE: "customer_grade",
  CHANNEL_CUSTOMER_GRADE: "channel_customer_grade",
  CUSTOMER_TAG: "customer_tag",
  CONTACT_TITLE: "contact_title",
  CONTACT_DEPARTMENT: "contact_department",
  CONTACT_ROLE: "contact_role",
  OPPORTUNITY_STAGE: "opportunity_stage",
  PROJECT_COST_CATEGORY: "project_cost_category",
  CONTRACT_PAYMENT_METHOD: "contract_payment_method",
  INTERNAL_COST_PRODUCT: "internal_cost_product",
  EXTERNAL_COST_PRODUCT: "external_cost_product",
} as const;

export type ConfigCategory = (typeof CONFIG_CATEGORY)[keyof typeof CONFIG_CATEGORY];

export const CONFIG_CATEGORY_LABELS: Record<ConfigCategory, string> = {
  [CONFIG_CATEGORY.CUSTOMER_SOURCE]: "客户来源",
  [CONFIG_CATEGORY.CUSTOMER_TYPE]: "关系类型",
  [CONFIG_CATEGORY.CUSTOMER_GRADE]: "客户等级（直接客户）",
  [CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE]: "客户等级（渠道）",
  [CONFIG_CATEGORY.CUSTOMER_TAG]: "客户标签",
  [CONFIG_CATEGORY.CONTACT_TITLE]: "联系人职务",
  [CONFIG_CATEGORY.CONTACT_DEPARTMENT]: "联系人科室/部门（医院）",
  [CONFIG_CATEGORY.CONTACT_ROLE]: "联系人角色",
  [CONFIG_CATEGORY.OPPORTUNITY_STAGE]: "商机阶段",
  [CONFIG_CATEGORY.PROJECT_COST_CATEGORY]: "项目成本类别",
  [CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD]: "合同支付方式",
  [CONFIG_CATEGORY.INTERNAL_COST_PRODUCT]: "内部成本产品",
  [CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT]: "外部成本产品",
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
    label: "客户",
    scope: "sales",
    fields: [
      { category: CONFIG_CATEGORY.CUSTOMER_SOURCE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_SOURCE] },
      { category: CONFIG_CATEGORY.CUSTOMER_TYPE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_TYPE] },
      { category: CONFIG_CATEGORY.CUSTOMER_GRADE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_GRADE] },
      {
        category: CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE,
        label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE],
      },
      { category: CONFIG_CATEGORY.CUSTOMER_TAG, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CUSTOMER_TAG] },
      { category: CONFIG_CATEGORY.CONTACT_TITLE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CONTACT_TITLE] },
      { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CONTACT_DEPARTMENT] },
      { category: CONFIG_CATEGORY.CONTACT_ROLE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CONTACT_ROLE] },
    ],
  },
  {
    id: "opportunity",
    label: "商机",
    scope: "sales",
    fields: [
      { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.OPPORTUNITY_STAGE] },
    ],
  },
  {
    id: "contract",
    label: "合同",
    scope: "sales",
    fields: [
      { category: CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD, label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD] },
      {
        category: CONFIG_CATEGORY.INTERNAL_COST_PRODUCT,
        label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.INTERNAL_COST_PRODUCT],
      },
      {
        category: CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT,
        label: CONFIG_CATEGORY_LABELS[CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT],
      },
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
  if (category) {
    for (const mod of CONFIG_MODULES) {
      const field = mod.fields.find((f) => f.category === category);
      if (field) return { module: mod, field };
    }
  }
  const mod = CONFIG_MODULES.find((m) => m.id === moduleId) ?? CONFIG_MODULES[0];
  const field = mod.fields.find((f) => f.category === category) ?? mod.fields[0];
  return { module: mod, field };
}

export async function getAllConfigOptionsGrouped() {
  const db = getPrismaClient();
  const defaultCategories = [...new Set(DEFAULT_CUSTOMER_FIELD_OPTIONS.map((opt) => opt.category))];
  await Promise.all(defaultCategories.map((category) => ensureDefaultConfigOptions(category)));
  const { normalizeCanonicalCustomerTypeValues } = await import(
    "@/lib/customers/customer-type-grade"
  );
  await normalizeCanonicalCustomerTypeValues();
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
  if (category === CONFIG_CATEGORY.CUSTOMER_TYPE) {
    const { normalizeCanonicalCustomerTypeValues } = await import(
      "@/lib/customers/customer-type-grade"
    );
    await normalizeCanonicalCustomerTypeValues();
  }
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
  if (categories.includes(CONFIG_CATEGORY.CUSTOMER_TYPE)) {
    const { normalizeCanonicalCustomerTypeValues } = await import(
      "@/lib/customers/customer-type-grade"
    );
    await normalizeCanonicalCustomerTypeValues();
  }
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
  ...DEFAULT_CHANNEL_CUSTOMER_GRADE_CONFIG_OPTIONS,
  { category: CONFIG_CATEGORY.CONTACT_TITLE, value: "DEAN", label: "院长", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CONTACT_TITLE, value: "VICE_DEAN", label: "副院长", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CONTACT_TITLE, value: "DIRECTOR", label: "主任", sortOrder: 3 },
  { category: CONFIG_CATEGORY.CONTACT_TITLE, value: "DEPUTY_DIRECTOR", label: "副主任", sortOrder: 4 },
  { category: CONFIG_CATEGORY.CONTACT_TITLE, value: "SECTION_CHIEF", label: "科长", sortOrder: 5 },
  { category: CONFIG_CATEGORY.CONTACT_TITLE, value: "IT_DIRECTOR", label: "信息中心主任", sortOrder: 6 },
  { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, value: "IT", label: "信息科", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, value: "MEDICAL_AFFAIRS", label: "医务科", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, value: "NURSING", label: "护理部", sortOrder: 3 },
  { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, value: "OUTPATIENT", label: "门诊部", sortOrder: 4 },
  { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, value: "INPATIENT", label: "住院部", sortOrder: 5 },
  { category: CONFIG_CATEGORY.CONTACT_DEPARTMENT, value: "ADMIN_OFFICE", label: "院办", sortOrder: 6 },
  { category: CONFIG_CATEGORY.CONTACT_ROLE, value: "DECISION_MAKER", label: "决策人", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CONTACT_ROLE, value: "TECHNICAL", label: "技术对接人", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CONTACT_ROLE, value: "OTHER", label: "其他", sortOrder: 3 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "INITIAL_VISIT", label: "初访", sortOrder: 1 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "NEEDS_CONFIRM", label: "需求确认", sortOrder: 2 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "PROPOSAL", label: "方案", sortOrder: 3 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "QUOTATION", label: "报价", sortOrder: 4 },
  { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, value: "NEGOTIATION", label: "谈判", sortOrder: 5 },
  { category: CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD, value: "BANK_TRANSFER", label: "银行转账", sortOrder: 1 },
  { category: CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD, value: "ACCEPTANCE", label: "承兑汇票", sortOrder: 2 },
  { category: CONFIG_CATEGORY.CONTRACT_PAYMENT_METHOD, value: "OTHER", label: "其他", sortOrder: 3 },
  { category: CONFIG_CATEGORY.INTERNAL_COST_PRODUCT, value: "IMPL_SERVICE", label: "实施服务", sortOrder: 1 },
  { category: CONFIG_CATEGORY.INTERNAL_COST_PRODUCT, value: "SOFTWARE", label: "软件产品", sortOrder: 2 },
  { category: CONFIG_CATEGORY.INTERNAL_COST_PRODUCT, value: "HARDWARE", label: "硬件设备", sortOrder: 3 },
  { category: CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT, value: "BROKERAGE", label: "居间费", sortOrder: 1 },
  { category: CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT, value: "CHANNEL_FEE", label: "渠道费用", sortOrder: 2 },
  { category: CONFIG_CATEGORY.EXTERNAL_COST_PRODUCT, value: "OUTSOURCE", label: "外采服务", sortOrder: 3 },
] as const;

async function buildGradeLabelMap(
  category: typeof CONFIG_CATEGORY.CUSTOMER_GRADE | typeof CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE,
  fallback: ConfigOptionItem[]
): Promise<Record<string, string>> {
  const options = await getConfigOptions(category);
  const map = Object.fromEntries(options.map((option) => [option.value, option.label]));
  for (const option of fallback) {
    if (!map[option.value]) map[option.value] = option.label;
  }
  return map;
}

export async function getCustomerGradeLabelMap(
  customerType?: string | null
): Promise<Record<string, string>> {
  if (isChannelCustomerType(customerType)) {
    return buildGradeLabelMap(
      CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE,
      DEFAULT_CHANNEL_CUSTOMER_GRADE_CONFIG_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      }))
    );
  }
  return buildGradeLabelMap(CONFIG_CATEGORY.CUSTOMER_GRADE, getCustomerGradeOptions());
}

/** 列表混用直接/渠道客户时：同 value 优先直接客户文案，渠道另存 */
export async function getCustomerGradeLabelMaps(): Promise<{
  direct: Record<string, string>;
  channel: Record<string, string>;
}> {
  const [direct, channel] = await Promise.all([
    getCustomerGradeLabelMap("DIRECT"),
    getCustomerGradeLabelMap("CHANNEL"),
  ]);
  return { direct, channel };
}

export function pickGradeLabelMap(
  customerType: string | null | undefined,
  maps: { direct: Record<string, string>; channel: Record<string, string> }
) {
  return isChannelCustomerType(customerType) ? maps.channel : maps.direct;
}

export async function loadContactFormOptions() {
  const [titleOptions, departmentOptions, roleOptions] = await Promise.all([
    getConfigOptions(CONFIG_CATEGORY.CONTACT_TITLE),
    getConfigOptions(CONFIG_CATEGORY.CONTACT_DEPARTMENT),
    getConfigOptions(CONFIG_CATEGORY.CONTACT_ROLE),
  ]);
  return { titleOptions, departmentOptions, roleOptions };
}

export async function loadCustomerFormOptions() {
  const [sourceOptions, typeOptions, gradeOptions, channelGradeOptions, tagOptions] =
    await Promise.all([
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_GRADE),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE),
      getCustomerTagDefinitions(),
    ]);
  return {
    sourceOptions,
    typeOptions,
    gradeOptions,
    channelGradeOptions,
    tagOptions,
  };
}

export async function loadInteractionFormOptions() {
  const [sourceOptions, typeOptions, gradeOptions, channelGradeOptions, tagOptions, stageOptions] =
    await Promise.all([
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_GRADE),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE),
      getCustomerTagDefinitions(),
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
    ]);
  return {
    sourceOptions,
    typeOptions,
    gradeOptions,
    channelGradeOptions,
    tagOptions,
    stageOptions,
  };
}

export async function loadCustomerFieldLabelMaps() {
  const maps = await getConfigOptionMaps([
    CONFIG_CATEGORY.CUSTOMER_SOURCE,
    CONFIG_CATEGORY.CUSTOMER_TYPE,
    CONFIG_CATEGORY.CUSTOMER_GRADE,
    CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE,
  ]);
  return maps;
}
