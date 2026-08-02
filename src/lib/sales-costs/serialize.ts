import type { SalesCostType } from "@prisma/client";

export type SalesCostListItem = {
  id: string;
  costDate: string;
  costType: SalesCostType;
  totalAmount: number;
  salesUserName: string;
  recordedByName: string;
  customerName?: string;
  customerId?: string;
  presalesUserName?: string;
  presalesDays?: number;
  presalesPersonnelCost?: number;
  accommodation?: number;
  transportation?: number;
  meals?: number;
  otherTravel?: number;
  accommodationNote?: string;
  transportationNote?: string;
  mealsNote?: string;
  otherTravelNote?: string;
  description?: string;
};

type CostRecord = {
  id: string;
  costDate: Date;
  costType: SalesCostType;
  totalAmount: unknown;
  presalesDays: number | null;
  presalesPersonnelCost: unknown;
  accommodation: unknown;
  transportation: unknown;
  meals: unknown;
  otherTravel: unknown;
  accommodationNote: string | null;
  transportationNote: string | null;
  mealsNote: string | null;
  otherTravelNote: string | null;
  description: string | null;
  salesUser: { name: string };
  recordedBy: { name: string };
  customer: { id: string; name: string } | null;
  presalesUser: { name: string } | null;
};

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toOptionalText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text || undefined;
}

export function serializeSalesCostForList(cost: CostRecord): SalesCostListItem {
  return {
    id: cost.id,
    costDate: cost.costDate.toISOString(),
    costType: cost.costType,
    totalAmount: Number(cost.totalAmount),
    salesUserName: cost.salesUser.name,
    recordedByName: cost.recordedBy.name,
    customerName: cost.customer?.name,
    customerId: cost.customer?.id,
    presalesUserName: cost.presalesUser?.name,
    presalesDays: cost.presalesDays ?? undefined,
    presalesPersonnelCost: toNumber(cost.presalesPersonnelCost),
    accommodation: toNumber(cost.accommodation),
    transportation: toNumber(cost.transportation),
    meals: toNumber(cost.meals),
    otherTravel: toNumber(cost.otherTravel),
    accommodationNote: toOptionalText(cost.accommodationNote),
    transportationNote: toOptionalText(cost.transportationNote),
    mealsNote: toOptionalText(cost.mealsNote),
    otherTravelNote: toOptionalText(cost.otherTravelNote),
    description: toOptionalText(cost.description),
  };
}
