import type { ExpenseCostTarget, SalesCostType } from "@prisma/client";

/**
 * 历史「业务用途」类别；新报销以费用细类（住宿/交通等）为准，见 fee-categories。
 * 保留供旧发票 categoryKey 展示与归属建议。
 */
export type ExpenseCategoryRule = {
  key: string;
  label: string;
  suggestedTarget: ExpenseCostTarget;
  suggestedSalesCostType?: SalesCostType;
  requireProject: boolean;
  requireAllocation: boolean;
};

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
  {
    key: "lodging",
    label: "住宿",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "PERSONAL_TRAVEL",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "transport",
    label: "交通",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "PERSONAL_TRAVEL",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "meal_subsidy",
    label: "补贴",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "PERSONAL_TRAVEL",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "business_entertainment",
    label: "商务招待",
    suggestedTarget: "SALES",
    suggestedSalesCostType: "BUSINESS",
    requireProject: false,
    requireAllocation: true,
  },
  {
    key: "office",
    label: "办公杂费",
    suggestedTarget: "NONE",
    requireProject: false,
    requireAllocation: false,
  },
];

export function getExpenseCategoryRule(key: string | null | undefined) {
  return EXPENSE_CATEGORY_RULES.find((r) => r.key === key) ?? null;
}

export const EXPENSE_CLAIM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_MANAGER: "待上级审批",
  REJECTED: "已驳回",
  PENDING_HR: "待行政确认",
  PENDING_PAYOUT: "待管理员打款",
  PAID: "已打款结案",
};

/** 我的报销列表用的状态文案 */
export function formatExpenseClaimListStatus(
  status: string,
  managerName?: string | null
): string {
  if (status === "DRAFT") return "草稿";
  if (status === "PENDING_MANAGER") {
    const name = managerName?.trim();
    return name ? `当前待${name}审批` : "当前待上级审批";
  }
  if (status === "REJECTED") return "已驳回";
  if (status === "PENDING_HR") return "待行政确认";
  if (status === "PENDING_PAYOUT") return "待管理员打款";
  if (status === "PAID") return "已打款";
  return EXPENSE_CLAIM_STATUS_LABELS[status] ?? status;
}

export const EXPENSE_CLAIM_KIND_LABELS: Record<string, string> = {
  TRAVEL: "差旅报销",
  FEE: "费用报销",
  PROJECT: "项目报销",
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
