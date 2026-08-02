import type { ExpenseCostTarget, SalesCostType } from "@prisma/client";

export type ExpenseCategoryRule = {
  key: string;
  label: string;
  suggestedTarget: ExpenseCostTarget;
  suggestedSalesCostType?: SalesCostType;
  requireProject: boolean;
  requireAllocation: boolean;
};

/** 费用类别默认归属建议（一期常量，后台可后续迁配置表） */
export const EXPENSE_CATEGORY_RULES: ExpenseCategoryRule[] = [
  {
    key: "customer_visit",
    label: "客户拜访差旅",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "PERSONAL_TRAVEL",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "presales_support",
    label: "售前支持差旅",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "PRESALES",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "business_expense",
    label: "商务费用",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "BUSINESS",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "project_site",
    label: "项目现场/实施",
    suggestedTarget: "PROJECT",
    requireProject: true,
    requireAllocation: true,
  },
  {
    key: "admin_office",
    label: "行政办公",
    suggestedTarget: "NONE",
    requireProject: false,
    requireAllocation: false,
  },
  {
    key: "other",
    label: "其他/未分类",
    suggestedTarget: "NONE",
    requireProject: false,
    requireAllocation: true,
  },
];

export function getExpenseCategoryRule(key: string | null | undefined) {
  return EXPENSE_CATEGORY_RULES.find((r) => r.key === key) ?? null;
}

export const EXPENSE_CLAIM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_MANAGER: "待上级审批",
  REJECTED: "已驳回",
  PENDING_PAYOUT: "待打款",
  PAID: "已打款结案",
};

export const EXPENSE_COST_TARGET_LABELS: Record<ExpenseCostTarget, string> = {
  SALES: "销售成本",
  PROJECT: "项目成本",
  NONE: "不入销售/项目成本",
};

export const ALL_AUTHED_ROLES = [
  "SALES",
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "PROJECT_STAFF",
  "ADMIN",
  "HR",
] as const;

export function canFinanceExpense(role: string) {
  return role === "HR" || role === "ADMIN";
}
