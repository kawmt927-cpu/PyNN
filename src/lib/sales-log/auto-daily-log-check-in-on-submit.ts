import { SalesCheckInStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDayRange } from "@/lib/sales-log/access";
import { AUTO_DAILY_LOG_CHECK_IN_NOTES } from "@/lib/sales-log/auto-log-check-in";
import { applyCheckInIpAudit } from "@/lib/sales-log/check-in-ip-guard";
import { hasCheckInLocation } from "@/lib/sales-log/format-location";

export type PendingCheckInLocation = {
  latitude?: number | null;
  longitude?: number | null;
  locationText?: string | null;
  addressProvince?: string | null;
  addressCity?: string | null;
  addressDistrict?: string | null;
  addressStreet?: string | null;
};

export function parsePendingCheckInLocation(raw: unknown): PendingCheckInLocation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const num = (key: string) => {
    const v = o[key];
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (key: string) => {
    const v = o[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const location: PendingCheckInLocation = {
    latitude: num("latitude"),
    longitude: num("longitude"),
    locationText: str("locationText") ?? str("addressLabel"),
    addressProvince: str("addressProvince"),
    addressCity: str("addressCity"),
    addressDistrict: str("addressDistrict"),
    addressStreet: str("addressStreet"),
  };
  const hasAny =
    location.latitude != null ||
    location.longitude != null ||
    Boolean(location.locationText) ||
    Boolean(location.addressProvince) ||
    Boolean(location.addressCity);
  return hasAny ? location : null;
}

export function readPendingCheckInLocation(
  structuredOutput: unknown
): PendingCheckInLocation | null {
  if (!structuredOutput || typeof structuredOutput !== "object" || Array.isArray(structuredOutput)) {
    return null;
  }
  return parsePendingCheckInLocation(
    (structuredOutput as Record<string, unknown>).pendingCheckInLocation
  );
}

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 补交历史日时，让 checkedInAt 落在日志日，便于 KPI 按日历日匹配 */
export function resolveAutoCheckInTimestamp(logDate: Date, submittedAt: Date): Date {
  const logDay = startOfLocalDay(logDate).getTime();
  const submitDay = startOfLocalDay(submittedAt).getTime();
  if (logDay === submitDay) return submittedAt;
  const aligned = new Date(logDate);
  aligned.setHours(
    submittedAt.getHours(),
    submittedAt.getMinutes(),
    submittedAt.getSeconds(),
    submittedAt.getMilliseconds()
  );
  return aligned;
}

/**
 * 日报提交成功后同步写入无客户定位打卡（与 KPI「当日有打卡」口径对齐）。
 * 若该日志日已有任意打卡则跳过；定位可选（无 GPS 时也创建记录）。
 */
export async function ensureAutoDailyLogCheckInOnSubmit(input: {
  userId: string;
  role: UserRole;
  dailyLogId: string;
  logDate: Date;
  submittedAt: Date;
  location?: PendingCheckInLocation | null;
  clientIp?: string | null;
}) {
  const { start, end } = getDayRange(input.logDate);

  const existingOnLogDay = await prisma.salesCheckIn.findFirst({
    where: {
      userId: input.userId,
      checkedInAt: { gte: start, lt: end },
    },
  });
  if (existingOnLogDay) return existingOnLogDay;

  const existingLinked = await prisma.salesCheckIn.findFirst({
    where: {
      userId: input.userId,
      salesDailyLogId: input.dailyLogId,
      notes: AUTO_DAILY_LOG_CHECK_IN_NOTES,
    },
  });
  if (existingLinked) return existingLinked;

  const loc = input.location;
  const checkedInAt = resolveAutoCheckInTimestamp(input.logDate, input.submittedAt);

  const checkIn = await prisma.salesCheckIn.create({
    data: {
      userId: input.userId,
      salesDailyLogId: input.dailyLogId,
      notes: AUTO_DAILY_LOG_CHECK_IN_NOTES,
      status: SalesCheckInStatus.COMPLETED,
      checkedInAt,
      latitude: loc?.latitude ?? undefined,
      longitude: loc?.longitude ?? undefined,
      locationText: loc?.locationText ?? undefined,
      addressProvince: loc?.addressProvince ?? undefined,
      addressCity: loc?.addressCity ?? undefined,
      addressDistrict: loc?.addressDistrict ?? undefined,
      addressStreet: loc?.addressStreet ?? undefined,
    },
  });

  if (hasCheckInLocation(checkIn) || input.clientIp) {
    await applyCheckInIpAudit({
      checkInId: checkIn.id,
      clientIp: input.clientIp ?? null,
    });
  }

  return checkIn;
}
