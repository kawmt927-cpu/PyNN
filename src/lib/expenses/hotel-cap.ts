import { getExpenseFeeCategoryByKey } from "@/lib/expenses/fee-categories";
import {
  EXPENSE_CITY_TIER_LABELS,
  resolveCityTier,
} from "@/lib/expenses/travel-policy";
import {
  summarizeLodgingNightsByCity,
  type LodgingTripSegment,
} from "@/lib/expenses/trip-lodging";

type TripLike = LodgingTripSegment;

export type HotelCapSegment = {
  city: string;
  tierLabel: string;
  nights: number;
  capPerNight: number;
  subtotal: number;
};

export type HotelCapEvaluation = {
  exceeded: boolean;
  lodgingSum: number;
  maxAllowed: number;
  segments: HotelCapSegment[];
  /** 面向用户的说明（含明细） */
  message: string | null;
};

/** 计算住宿类可报上限（昨到/今发归因晚数 × 城市每晚标准） */
export async function computeHotelCapAllowance(input: {
  trips: TripLike[];
}): Promise<{ maxAllowed: number; segments: HotelCapSegment[] }> {
  const tripsWithCity = input.trips.filter((t) => t.city?.trim() || t.fromCity?.trim());
  const capCache = new Map<string, { tierLabel: string; hotelCapPerNight: number }>();

  async function capOf(city: string) {
    const key = city.trim();
    const hit = capCache.get(key);
    if (hit) return hit;
    const { tier, hotelCapPerNight } = await resolveCityTier(key);
    const row = {
      tierLabel: EXPENSE_CITY_TIER_LABELS[tier],
      hotelCapPerNight,
    };
    capCache.set(key, row);
    return row;
  }

  for (const t of tripsWithCity) {
    if (t.city?.trim()) await capOf(t.city);
    if (t.fromCity?.trim()) await capOf(t.fromCity);
  }

  const preferLower = (a: string, b: string) => {
    const ca = capCache.get(a.trim())?.hotelCapPerNight ?? Number.POSITIVE_INFINITY;
    const cb = capCache.get(b.trim())?.hotelCapPerNight ?? Number.POSITIVE_INFINITY;
    return ca <= cb ? a : b;
  };

  const byCity = summarizeLodgingNightsByCity(tripsWithCity, preferLower);
  const segments: HotelCapSegment[] = [];
  let maxAllowed = 0;

  for (const row of byCity) {
    const { tierLabel, hotelCapPerNight } = await capOf(row.city);
    if (!(hotelCapPerNight > 0) || row.nights <= 0) continue;
    const subtotal = row.nights * hotelCapPerNight;
    maxAllowed += subtotal;
    segments.push({
      city: row.city,
      tierLabel,
      nights: row.nights,
      capPerNight: hotelCapPerNight,
      subtotal,
    });
  }

  return { maxAllowed, segments };
}

function formatHotelCapMessage(input: {
  lodgingSum: number;
  maxAllowed: number;
  segments: HotelCapSegment[];
}) {
  const detail = input.segments
    .map(
      (s) =>
        `${s.city}（${s.tierLabel}）¥${s.capPerNight}/晚 × ${s.nights} 晚 = ¥${s.subtotal.toFixed(0)}`
    )
    .join("；");
  return `住宿类合计 ¥${input.lodgingSum.toFixed(2)} 超出标准上限 ¥${input.maxAllowed.toFixed(2)}${detail ? `（${detail}）` : ""}`;
}

/** 评估住宿是否超标（不抛错） */
export async function evaluateHotelCapForInvoices(input: {
  trips: TripLike[];
  invoices: Array<{ categoryKey: string | null; amount: number | null }>;
}): Promise<HotelCapEvaluation> {
  const lodgingInvoices = [];
  for (const inv of input.invoices) {
    const fee = await getExpenseFeeCategoryByKey(inv.categoryKey);
    if (fee?.enforceHotelCap) lodgingInvoices.push(inv);
  }
  const lodgingSum = lodgingInvoices.reduce(
    (sum, inv) => sum + Number(inv.amount ?? 0),
    0
  );
  if (lodgingInvoices.length === 0 || lodgingSum <= 0) {
    return {
      exceeded: false,
      lodgingSum,
      maxAllowed: 0,
      segments: [],
      message: null,
    };
  }

  const tripsWithCity = input.trips.filter((t) => t.city?.trim() || t.fromCity?.trim());
  if (tripsWithCity.length === 0) {
    return {
      exceeded: true,
      lodgingSum,
      maxAllowed: 0,
      segments: [],
      message: "住宿类费用需先在上方行程中填写出发/到达地点，以便按城市标准校验",
    };
  }

  const { maxAllowed, segments } = await computeHotelCapAllowance({
    trips: tripsWithCity,
  });
  const exceeded = lodgingSum > maxAllowed + 0.01;
  return {
    exceeded,
    lodgingSum,
    maxAllowed,
    segments,
    message: exceeded
      ? formatHotelCapMessage({ lodgingSum, maxAllowed, segments })
      : null,
  };
}

/**
 * @deprecated 超标改为可确认提交；请用 evaluateHotelCapForInvoices
 */
export async function assertHotelCapForInvoices(input: {
  trips: TripLike[];
  invoices: Array<{ categoryKey: string | null; amount: number | null }>;
}) {
  const result = await evaluateHotelCapForInvoices(input);
  if (result.exceeded && result.maxAllowed === 0 && result.segments.length === 0) {
    throw new Error(result.message ?? "住宿标准校验失败");
  }
  if (result.exceeded) {
    throw new Error(result.message ?? "住宿超出标准");
  }
}
