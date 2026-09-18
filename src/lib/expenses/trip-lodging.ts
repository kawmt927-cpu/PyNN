import { addDays, differenceInCalendarDays } from "date-fns";
import type { ExpenseCityTier } from "@prisma/client";
import { normalizeCityName } from "@/lib/expenses/travel-policy";

export type LodgingTripSegment = {
  startDate: Date | string;
  endDate: Date | string;
  fromCity?: string | null;
  city: string | null;
};

export type LodgingNightAttribution = {
  /** 过夜日（当晚），YYYY-MM-DD */
  nightDate: string;
  city: string;
  /** 昨到 / 今发是否一致 */
  matched: boolean;
  endOfDayCity: string | null;
  nextMorningCity: string | null;
};

type ParsedSeg = {
  start: Date;
  end: Date;
  fromCity: string | null;
  city: string | null;
  index: number;
};

function parseDay(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfLocalDay(value);
  }
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : startOfLocalDay(d);
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function overlapsDay(seg: ParsedSeg, day: Date) {
  return seg.start.getTime() <= day.getTime() && day.getTime() <= seg.end.getTime();
}

/**
 * 当日最后到达城市：重叠当日的行程中，按出发/到达日排序取最后一段的到达地。
 */
function lastArrivalOn(segs: ParsedSeg[], day: Date): string | null {
  const hits = segs.filter((s) => overlapsDay(s, day) && s.city?.trim());
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const ds = a.start.getTime() - b.start.getTime();
    if (ds !== 0) return ds;
    const de = a.end.getTime() - b.end.getTime();
    if (de !== 0) return de;
    return a.index - b.index;
  });
  return hits[hits.length - 1]!.city!.trim();
}

/**
 * 次日早晨所在城市：
 * 1) 次日有出发段 → 最早一段的出发地
 * 2) 否则若仍在跨日住宿段内 → 该段到达地
 */
function nextMorningCity(segs: ParsedSeg[], nextDay: Date): string | null {
  const starting = segs.filter(
    (s) => s.start.getTime() === nextDay.getTime() && s.fromCity?.trim()
  );
  if (starting.length > 0) {
    starting.sort((a, b) => {
      const de = a.end.getTime() - b.end.getTime();
      if (de !== 0) return de;
      return a.index - b.index;
    });
    return starting[0]!.fromCity!.trim();
  }

  const staying = segs.filter(
    (s) =>
      s.start.getTime() < nextDay.getTime() &&
      nextDay.getTime() <= s.end.getTime() &&
      s.city?.trim()
  );
  if (staying.length === 0) return null;
  staying.sort((a, b) => {
    const de = b.end.getTime() - a.end.getTime();
    if (de !== 0) return de;
    return a.index - b.index;
  });
  return staying[0]!.city!.trim();
}

/**
 * 按「昨到 / 今发」交叉验证归因每一晚住宿城市。
 * - 一致 → 该城
 * - 两侧都有但不一致 → 由调用方用较低标准城（此处仍返回两端，由 pickConservativeCity 处理）
 * - 缺一侧 → 不计该晚
 */
export function attributeLodgingNights(
  trips: LodgingTripSegment[]
): Array<{
  nightDate: string;
  endOfDayCity: string | null;
  nextMorningCity: string | null;
}> {
  const segs: ParsedSeg[] = [];
  for (let i = 0; i < trips.length; i++) {
    const t = trips[i]!;
    const start = parseDay(t.startDate);
    const end = parseDay(t.endDate);
    if (!start || !end || end < start) continue;
    segs.push({
      start,
      end,
      fromCity: t.fromCity?.trim() || null,
      city: t.city?.trim() || null,
      index: i,
    });
  }
  if (segs.length === 0) return [];

  let min = segs[0]!.start;
  let max = segs[0]!.end;
  for (const s of segs) {
    if (s.start < min) min = s.start;
    if (s.end > max) max = s.end;
  }

  const out: Array<{
    nightDate: string;
    endOfDayCity: string | null;
    nextMorningCity: string | null;
  }> = [];

  const span = differenceInCalendarDays(max, min);
  for (let i = 0; i < span; i++) {
    const day = addDays(min, i);
    const next = addDays(day, 1);
    out.push({
      nightDate: toDateKey(day),
      endOfDayCity: lastArrivalOn(segs, day),
      nextMorningCity: nextMorningCity(segs, next),
    });
  }
  return out;
}

export function pickConservativeCity(
  endOfDayCity: string | null,
  nextMorningCity: string | null,
  preferLower: (a: string, b: string) => string
): { city: string; matched: boolean } | null {
  if (!endOfDayCity || !nextMorningCity) return null;
  const a = normalizeCityName(endOfDayCity);
  const b = normalizeCityName(nextMorningCity);
  if (!a || !b) return null;
  if (a === b) return { city: endOfDayCity.trim(), matched: true };
  return { city: preferLower(endOfDayCity.trim(), nextMorningCity.trim()), matched: false };
}

export type LodgingNightsByCity = {
  city: string;
  nights: number;
  ambiguousNights: number;
};

/**
 * 汇总各城住宿晚数。歧义晚计入较低标准城市（由 preferLower 决定）。
 */
export function summarizeLodgingNightsByCity(
  trips: LodgingTripSegment[],
  preferLower: (a: string, b: string) => string
): LodgingNightsByCity[] {
  const nights = attributeLodgingNights(trips);
  const map = new Map<string, LodgingNightsByCity>();

  for (const n of nights) {
    const picked = pickConservativeCity(n.endOfDayCity, n.nextMorningCity, preferLower);
    if (!picked) continue;
    const key = normalizeCityName(picked.city);
    const prev = map.get(key) ?? {
      city: picked.city,
      nights: 0,
      ambiguousNights: 0,
    };
    prev.nights += 1;
    if (!picked.matched) prev.ambiguousNights += 1;
    map.set(key, prev);
  }

  return [...map.values()].sort((a, b) => a.city.localeCompare(b.city, "zh-CN"));
}

export function summarizeLodgingNightsByTier(
  trips: LodgingTripSegment[],
  resolveTier: (city: string) => ExpenseCityTier,
  preferLower: (a: string, b: string) => string
): { tier1: number; tier2: number; tier3: number; total: number } {
  const byCity = summarizeLodgingNightsByCity(trips, preferLower);
  const out = { tier1: 0, tier2: 0, tier3: 0, total: 0 };
  for (const row of byCity) {
    const tier = resolveTier(row.city);
    if (tier === "TIER_1") out.tier1 += row.nights;
    else if (tier === "TIER_2") out.tier2 += row.nights;
    else out.tier3 += row.nights;
    out.total += row.nights;
  }
  return out;
}
