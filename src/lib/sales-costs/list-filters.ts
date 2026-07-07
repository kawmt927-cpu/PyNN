import type { Prisma, SalesCostType } from "@prisma/client";

export type SalesCostListFilters = {
  salesUserId?: string;
  costType?: SalesCostType;
  year?: number;
  month?: number;
};

export function parseSalesCostListFilters(
  params: Record<string, string | string[] | undefined>
): SalesCostListFilters {
  const salesUserId = typeof params.salesUserId === "string" ? params.salesUserId : undefined;
  const costType =
    typeof params.costType === "string" &&
    ["PERSONAL_TRAVEL", "PRESALES", "BUSINESS"].includes(params.costType)
      ? (params.costType as SalesCostType)
      : undefined;
  const year = params.year ? Number(params.year) : undefined;
  const month = params.month ? Number(params.month) : undefined;

  return {
    salesUserId: salesUserId || undefined,
    costType,
    year: year && !Number.isNaN(year) ? year : undefined,
    month: month && month >= 1 && month <= 12 ? month : undefined,
  };
}

export function buildSalesCostListWhere(filters: SalesCostListFilters): Prisma.SalesCostWhereInput {
  const where: Prisma.SalesCostWhereInput = {};

  if (filters.salesUserId) where.salesUserId = filters.salesUserId;
  if (filters.costType) where.costType = filters.costType;

  if (filters.year) {
    const startMonth = filters.month ?? 1;
    const endMonth = filters.month ?? 12;
    const start = new Date(filters.year, startMonth - 1, 1);
    const end = new Date(filters.year, endMonth, 0, 23, 59, 59, 999);
    where.costDate = { gte: start, lte: end };
  }

  return where;
}
