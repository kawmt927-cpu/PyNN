import { parseDateOnlyInput } from "@/lib/validations/project";
import { compareDates, toDateOnly } from "./workdays";

function toDate(value: Date | string): Date {
  return toDateOnly(typeof value === "string" ? parseDateOnlyInput(value) : value);
}

export function dateRangesOverlap(
  startA: Date | string,
  endA: Date | string,
  startB: Date | string,
  endB: Date | string
): boolean {
  const a = toDate(startA);
  const b = toDate(endA);
  const c = toDate(startB);
  const d = toDate(endB);
  return compareDates(a, d) <= 0 && compareDates(b, c) >= 0;
}

export type DateRangeSegment = {
  id?: string;
  startDate: Date | string;
  endDate: Date | string;
};

export function findOverlappingSegment<T extends DateRangeSegment>(
  start: Date | string,
  end: Date | string,
  segments: T[],
  excludeId?: string
): T | undefined {
  return segments.find((segment) => {
    if (excludeId && segment.id === excludeId) return false;
    return dateRangesOverlap(start, end, segment.startDate, segment.endDate);
  });
}

export function assertSegmentsNoOverlap(
  segments: Array<{ id?: string; startDate: Date; endDate: Date }>
): void {
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (
        dateRangesOverlap(
          segments[i].startDate,
          segments[i].endDate,
          segments[j].startDate,
          segments[j].endDate
        )
      ) {
        throw new Error("同一项目内各排班分段不能有时间重叠");
      }
    }
  }
}
