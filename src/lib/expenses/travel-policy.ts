import type { ExpenseCityTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const EXPENSE_CITY_TIER_LABELS: Record<ExpenseCityTier, string> = {
  TIER_1: "一线城市",
  TIER_2: "二线城市",
  TIER_3: "三线城市及以下",
};

export const DEFAULT_HOTEL_CAPS = {
  hotelCapTier1: 500,
  hotelCapTier2: 400,
  hotelCapTier3: 300,
} as const;

export type EffectiveExpenseTravelPolicy = {
  hotelCapTier1: number;
  hotelCapTier2: number;
  hotelCapTier3: number;
};

export type ExpenseTravelPolicyAdminView = EffectiveExpenseTravelPolicy & {
  cities: Array<{
    id: string;
    cityName: string;
    tier: ExpenseCityTier;
    enabled: boolean;
    sortOrder: number;
  }>;
};

/** 规范化城市名：去空格、去尾缀「市」 */
export function normalizeCityName(raw: string): string {
  return raw.trim().replace(/市$/u, "");
}

export function hotelCapForTier(
  policy: EffectiveExpenseTravelPolicy,
  tier: ExpenseCityTier
): number {
  if (tier === "TIER_1") return policy.hotelCapTier1;
  if (tier === "TIER_2") return policy.hotelCapTier2;
  return policy.hotelCapTier3;
}

export async function findExpenseTravelPolicyRow() {
  return prisma.expenseTravelPolicy.findUnique({ where: { id: "default" } });
}

export async function getEffectiveExpenseTravelPolicy(): Promise<EffectiveExpenseTravelPolicy> {
  const row = await findExpenseTravelPolicyRow();
  return {
    hotelCapTier1: Number(row?.hotelCapTier1 ?? DEFAULT_HOTEL_CAPS.hotelCapTier1),
    hotelCapTier2: Number(row?.hotelCapTier2 ?? DEFAULT_HOTEL_CAPS.hotelCapTier2),
    hotelCapTier3: Number(row?.hotelCapTier3 ?? DEFAULT_HOTEL_CAPS.hotelCapTier3),
  };
}

export async function getExpenseTravelPolicyForAdmin(): Promise<ExpenseTravelPolicyAdminView> {
  const [policy, cities] = await Promise.all([
    getEffectiveExpenseTravelPolicy(),
    prisma.expenseCityTierMapping.findMany({
      orderBy: [{ tier: "asc" }, { sortOrder: "asc" }, { cityName: "asc" }],
    }),
  ]);
  return {
    ...policy,
    cities: cities.map((c) => ({
      id: c.id,
      cityName: c.cityName,
      tier: c.tier,
      enabled: c.enabled,
      sortOrder: c.sortOrder,
    })),
  };
}

export async function resolveCityTier(cityName: string | null | undefined): Promise<{
  tier: ExpenseCityTier;
  hotelCapPerNight: number;
  matchedCity: string | null;
}> {
  const policy = await getEffectiveExpenseTravelPolicy();
  const normalized = cityName ? normalizeCityName(cityName) : "";
  if (!normalized) {
    return {
      tier: "TIER_3",
      hotelCapPerNight: policy.hotelCapTier3,
      matchedCity: null,
    };
  }

  const all = await prisma.expenseCityTierMapping.findMany({
    where: { enabled: true },
    select: { cityName: true, tier: true },
  });
  const hit = all.find((row) => normalizeCityName(row.cityName) === normalized);
  const tier = hit?.tier ?? "TIER_3";
  return {
    tier,
    hotelCapPerNight: hotelCapForTier(policy, tier),
    matchedCity: hit?.cityName ?? null,
  };
}

/** 供报销页展示：各城市住宿标准提示 */
export async function listCityHotelHints(): Promise<
  Array<{ cityName: string; tier: ExpenseCityTier; hotelCapPerNight: number; tierLabel: string }>
> {
  const policy = await getEffectiveExpenseTravelPolicy();
  const cities = await prisma.expenseCityTierMapping.findMany({
    where: { enabled: true },
    orderBy: [{ tier: "asc" }, { sortOrder: "asc" }, { cityName: "asc" }],
  });
  return cities.map((c) => ({
    cityName: c.cityName,
    tier: c.tier,
    hotelCapPerNight: hotelCapForTier(policy, c.tier),
    tierLabel: EXPENSE_CITY_TIER_LABELS[c.tier],
  }));
}
