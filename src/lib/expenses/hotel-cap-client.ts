import type { ExpenseCityTier } from "@prisma/client";
import { normalizeCityName } from "@/lib/expenses/travel-policy";
import type { EffectiveExpenseTravelPolicy } from "@/lib/expenses/travel-policy";
import { summarizeLodgingNightsByCity } from "@/lib/expenses/trip-lodging";

type Hint = { cityName: string; tier: ExpenseCityTier; hotelCapPerNight: number };
type TripSeg = {
  startDate: Date | string;
  endDate: Date | string;
  fromCity?: string | null;
  city: string | null;
};
type ItemLike = {
  categoryKey: string | null;
  notes: string | null;
  kind?: string;
  invoices: Array<{ amount: unknown; categoryKey: string | null }>;
};
type FeeCat = { key: string; enforceHotelCap: boolean };

function capForCity(
  city: string,
  hints: Hint[],
  policy: EffectiveExpenseTravelPolicy
): number {
  const key = normalizeCityName(city);
  const hint = hints.find((h) => normalizeCityName(h.cityName) === key);
  return hint?.hotelCapPerNight ?? policy.hotelCapTier3;
}

function isLodgingItem(item: ItemLike, feeCategories: FeeCat[]) {
  const key =
    item.categoryKey ||
    item.invoices[0]?.categoryKey ||
    (item.kind === "TRAVEL" ? null : null);
  if (!key) return false;
  return feeCategories.some((c) => c.key === key && c.enforceHotelCap);
}

function preferLowerCity(
  a: string,
  b: string,
  hints: Hint[],
  policy: EffectiveExpenseTravelPolicy
) {
  const ca = capForCity(a, hints, policy);
  const cb = capForCity(b, hints, policy);
  return ca <= cb ? a : b;
}

/** 供行程区展示住宿上限明细 */
export function computeLodgingCapPreview(input: {
  trips: TripSeg[];
  cityHotelHints: Hint[];
  hotelPolicy: EffectiveExpenseTravelPolicy;
}) {
  const byCity = summarizeLodgingNightsByCity(input.trips, (a, b) =>
    preferLowerCity(a, b, input.cityHotelHints, input.hotelPolicy)
  );
  const parts: string[] = [];
  let maxAllowed = 0;
  for (const row of byCity) {
    const cap = capForCity(row.city, input.cityHotelHints, input.hotelPolicy);
    if (!(cap > 0) || row.nights <= 0) continue;
    maxAllowed += row.nights * cap;
    parts.push(`${row.city} ¥${cap}/晚×${row.nights}晚`);
  }
  return maxAllowed > 0 ? { maxAllowed, parts } : null;
}

/** 前端即时评估住宿是否超标（与服务端规则一致：昨到/今发归因） */
export function evaluateHotelCapClient(input: {
  trips: TripSeg[];
  items: ItemLike[];
  feeCategories: FeeCat[];
  cityHotelHints: Hint[];
  hotelPolicy: EffectiveExpenseTravelPolicy;
}) {
  let lodgingSum = 0;
  const lodgingNotes: string[] = [];
  let missingNotes = false;
  for (const item of input.items) {
    if (!isLodgingItem(item, input.feeCategories)) continue;
    const sum = item.invoices.reduce((s, inv) => s + Number(inv.amount ?? 0), 0);
    if (sum <= 0) continue;
    lodgingSum += sum;
    if (item.notes?.trim()) lodgingNotes.push(item.notes.trim());
    else missingNotes = true;
  }

  const preview = computeLodgingCapPreview({
    trips: input.trips,
    cityHotelHints: input.cityHotelHints,
    hotelPolicy: input.hotelPolicy,
  });
  const maxAllowed = preview?.maxAllowed ?? 0;
  const parts = preview?.parts ?? [];

  const exceeded = lodgingSum > 0 && lodgingSum > maxAllowed + 0.01;
  const message = exceeded
    ? `住宿类合计 ¥${lodgingSum.toFixed(2)} 超出标准上限 ¥${maxAllowed.toFixed(2)}${parts.length ? `（${parts.join("；")}）` : ""}`
    : null;

  return {
    lodgingSum,
    maxAllowed,
    parts,
    exceeded,
    missingNotes: exceeded && missingNotes,
    lodgingNotes,
    message,
  };
}
