import type { ExpenseCostTarget, ExpenseFeeCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ExpenseFeeCategoryView = {
  key: string;
  label: string;
  enforceHotelCap: boolean;
  suggestedTarget: ExpenseCostTarget | null;
  enabled: boolean;
  sortOrder: number;
};

/** 差旅细类（不含「差旅」前缀）；顺序即类型选择器默认排序 */
export const TRAVEL_EXPENSE_FEE_KEYS = [
  "lodging",
  "train_ticket",
  "ride_hailing",
  "air_ticket",
  "taxi",
  "coach_ticket",
  "mileage_subsidy",
  "ferry_ticket",
  "toll",
  "metro_bus",
  "other_transport",
  "transport_insurance",
  "booking_fee",
  "travel_allowance",
] as const;

export const FEE_ONLY_KEYS = [
  "business_entertainment",
  "office",
  "other",
] as const;

/** 默认细类（库空时兜底；迁移后 seed 写入） */
export const DEFAULT_EXPENSE_FEE_CATEGORIES: ExpenseFeeCategoryView[] = [
  {
    key: "lodging",
    label: "住宿费",
    enforceHotelCap: true,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 10,
  },
  {
    key: "train_ticket",
    label: "火车票",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 20,
  },
  {
    key: "ride_hailing",
    label: "网约车",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 21,
  },
  {
    key: "air_ticket",
    label: "飞机票",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 22,
  },
  {
    key: "taxi",
    label: "出租车",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 23,
  },
  {
    key: "coach_ticket",
    label: "长途车票",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 24,
  },
  {
    key: "mileage_subsidy",
    label: "自驾里程补贴",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 25,
  },
  {
    key: "ferry_ticket",
    label: "轮船票",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 26,
  },
  {
    key: "toll",
    label: "过路费",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 27,
  },
  {
    key: "metro_bus",
    label: "地铁、公交",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 28,
  },
  {
    key: "other_transport",
    label: "其他交通费",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 29,
  },
  {
    key: "transport_insurance",
    label: "交通保险费",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 30,
  },
  {
    key: "booking_fee",
    label: "订票服务费",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 31,
  },
  {
    key: "travel_allowance",
    label: "补助",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 32,
  },
  // 旧通用「交通」「补贴」保留兼容，默认不在新单中展示
  {
    key: "transport",
    label: "交通（旧）",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: false,
    sortOrder: 200,
  },
  {
    key: "meal_subsidy",
    label: "补贴（旧）",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: false,
    sortOrder: 201,
  },
  {
    key: "business_entertainment",
    label: "商务招待",
    enforceHotelCap: false,
    suggestedTarget: "SALES",
    enabled: true,
    sortOrder: 40,
  },
  {
    key: "office",
    label: "办公杂费",
    enforceHotelCap: false,
    suggestedTarget: "NONE",
    enabled: true,
    sortOrder: 50,
  },
  {
    key: "other",
    label: "其他",
    enforceHotelCap: false,
    suggestedTarget: null,
    enabled: true,
    sortOrder: 90,
  },
];

function toView(row: ExpenseFeeCategory): ExpenseFeeCategoryView {
  return {
    key: row.key,
    label: row.label,
    enforceHotelCap: row.enforceHotelCap,
    suggestedTarget: row.suggestedTarget,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  };
}

/** 确保默认细类已写入（幂等） */
export async function ensureDefaultExpenseFeeCategories() {
  for (const item of DEFAULT_EXPENSE_FEE_CATEGORIES) {
    await prisma.expenseFeeCategory.upsert({
      where: { key: item.key },
      create: {
        key: item.key,
        label: item.label,
        enforceHotelCap: item.enforceHotelCap,
        suggestedTarget: item.suggestedTarget,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      },
      update: {
        label: item.label,
        enforceHotelCap: item.enforceHotelCap,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      },
    });
  }
}

export async function listExpenseFeeCategories(opts?: {
  includeDisabled?: boolean;
}): Promise<ExpenseFeeCategoryView[]> {
  await ensureDefaultExpenseFeeCategories();
  const rows = await prisma.expenseFeeCategory.findMany({
    where: opts?.includeDisabled ? undefined : { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  if (rows.length === 0) return DEFAULT_EXPENSE_FEE_CATEGORIES.filter((r) => r.enabled);
  return rows.map(toView);
}

export async function getExpenseFeeCategoryByKey(key: string | null | undefined) {
  if (!key) return null;
  const rows = await listExpenseFeeCategories({ includeDisabled: true });
  return rows.find((r) => r.key === key) ?? null;
}

export function isTravelFeeCategoryKey(key: string | null | undefined) {
  if (!key) return false;
  return (TRAVEL_EXPENSE_FEE_KEYS as readonly string[]).includes(key) || key === "transport" || key === "meal_subsidy";
}
