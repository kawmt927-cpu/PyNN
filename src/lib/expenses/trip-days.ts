import type { ExpenseCityTier } from "@prisma/client";
import { normalizeCityName } from "@/lib/expenses/travel-policy";
import {
  summarizeLodgingNightsByTier,
  type LodgingTripSegment,
} from "@/lib/expenses/trip-lodging";

export type TripDaySegment = LodgingTripSegment;

export type TripDaysByTier = {
  tier1: number;
  tier2: number;
  tier3: number;
  total: number;
};

export function resolveTierFromHints(
  cityName: string | null | undefined,
  hints: Array<{ cityName: string; tier: ExpenseCityTier }>
): ExpenseCityTier {
  const normalized = cityName ? normalizeCityName(cityName) : "";
  if (!normalized) return "TIER_3";
  const hit = hints.find((h) => normalizeCityName(h.cityName) === normalized);
  return hit?.tier ?? "TIER_3";
}

const TIER_RANK: Record<ExpenseCityTier, number> = {
  TIER_3: 0,
  TIER_2: 1,
  TIER_1: 2,
};

/**
 * 按到达城市线级汇总出差天数。
 * 口径：昨到/今发交叉验证后的住宿晚数；不一致取较低线级城市；缺一侧不计。
 */
export function summarizeTripDaysByTier(
  trips: TripDaySegment[],
  hints: Array<{ cityName: string; tier: ExpenseCityTier }>
): TripDaysByTier {
  const preferLower = (a: string, b: string) => {
    const ra = TIER_RANK[resolveTierFromHints(a, hints)];
    const rb = TIER_RANK[resolveTierFromHints(b, hints)];
    return ra <= rb ? a : b;
  };
  return summarizeLodgingNightsByTier(
    trips,
    (city) => resolveTierFromHints(city, hints),
    preferLower
  );
}

export const TRIP_TIER_DAY_LABELS: Record<"TIER_1" | "TIER_2" | "TIER_3", string> = {
  TIER_1: "一线城市",
  TIER_2: "二线城市",
  TIER_3: "三线城市",
};
