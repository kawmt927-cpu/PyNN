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
  PENDING_HR: "待一级复核",
  PENDING_PAYOUT: "待打款",
  PAID: "已通过",
};

/** 我的报销首页四态筛选 */
export type ExpenseMineChip =
  | "all"
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export const EXPENSE_MINE_CHIPS: Array<{
  key: ExpenseMineChip;
  label: string;
}> = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "pending", label: "审批中" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已驳回" },
];

export function parseExpenseMineChip(
  raw: string | undefined | null
): ExpenseMineChip {
  if (
    raw === "draft" ||
    raw === "pending" ||
    raw === "approved" ||
    raw === "rejected"
  ) {
    return raw;
  }
  return "all";
}

/** 对外四态（首页 chips / 列表徽标） */
export function expenseClaimChipStatus(status: string): {
  chip: Exclude<ExpenseMineChip, "all">;
  label: string;
} {
  if (status === "DRAFT") return { chip: "draft", label: "草稿" };
  if (status === "REJECTED") return { chip: "rejected", label: "已驳回" };
  if (status === "PAID") return { chip: "approved", label: "已通过" };
  if (
    status === "PENDING_MANAGER" ||
    status === "PENDING_HR" ||
    status === "PENDING_PAYOUT"
  ) {
    return { chip: "pending", label: "审批中" };
  }
  return { chip: "pending", label: EXPENSE_CLAIM_STATUS_LABELS[status] ?? status };
}

export function expenseStatusesForMineChip(
  chip: ExpenseMineChip
): string[] | null {
  if (chip === "all") return null;
  if (chip === "draft") return ["DRAFT"];
  if (chip === "rejected") return ["REJECTED"];
  if (chip === "approved") return ["PAID"];
  return ["PENDING_MANAGER", "PENDING_HR", "PENDING_PAYOUT"];
}

/** 我的报销列表用的状态文案（四态） */
export function formatExpenseClaimListStatus(
  status: string,
  _managerName?: string | null
): string {
  return expenseClaimChipStatus(status).label;
}

/** 审批中心等需要细粒度步骤时使用 */
export function formatExpenseClaimStepStatus(
  status: string,
  managerName?: string | null,
  stepName?: string | null
): string {
  if (status === "DRAFT") return "草稿";
  if (status === "REJECTED") return "已驳回";
  if (status === "PAID") return "已通过";
  if (status === "PENDING_MANAGER") {
    const name = managerName?.trim();
    return name ? `当前待${name}审批` : "当前待上级审批";
  }
  if (status === "PENDING_HR") return stepName?.trim() || "待一级复核";
  if (status === "PENDING_PAYOUT") return stepName?.trim() || "待打款";
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
