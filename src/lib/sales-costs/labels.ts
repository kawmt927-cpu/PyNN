import { SalesCostType } from "@prisma/client";

export const SALES_COST_TYPE_LABELS: Record<SalesCostType, string> = {
  PERSONAL_TRAVEL: "个人差旅",
  PRESALES: "售前费用",
  BUSINESS: "商务费用",
};

export const SALES_COST_TYPE_OPTIONS = Object.entries(SALES_COST_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as SalesCostType, label })
);
