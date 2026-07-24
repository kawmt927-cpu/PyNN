import { prisma } from "@/lib/prisma";
import { locateIpViaAmap } from "@/lib/amap/ip-locate";
import { isPrivateOrLocalIp } from "@/lib/request/client-ip";
import {
  createAppNotification,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/app-notifications";
import { AUTO_DAILY_LOG_CHECK_IN_NOTES, isAutoDailyLogCheckIn } from "@/lib/sales-log/auto-log-check-in";

function normalizeRegion(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔|地区|盟|州|县|区/g, "")
    .toLowerCase();
}

function regionsMismatch(
  gps: { province?: string | null; city?: string | null },
  ip: { province?: string | null; city?: string | null }
): boolean {
  const gpsCity = normalizeRegion(gps.city);
  const ipCity = normalizeRegion(ip.city);
  const gpsProvince = normalizeRegion(gps.province);
  const ipProvince = normalizeRegion(ip.province);

  if (gpsCity && ipCity) return gpsCity !== ipCity;
  if (gpsProvince && ipProvince) return gpsProvince !== ipProvince;
  if (gpsCity && ipProvince) return !gpsCity.includes(ipProvince) && !ipProvince.includes(gpsCity);
  if (gpsProvince && ipCity) return !ipCity.includes(gpsProvince) && !gpsProvince.includes(ipCity);
  return false;
}

/**
 * 打卡后静默写入 IP 与地理比对结果；不一致时通知上级（销售端不可见 IP）。
 */
export async function applyCheckInIpAudit(input: {
  checkInId: string;
  clientIp: string | null;
}) {
  const checkIn = await prisma.salesCheckIn.findUnique({
    where: { id: input.checkInId },
    include: {
      user: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });
  if (!checkIn) return;

  const clientIp = input.clientIp?.trim() || null;
  let ipProvince: string | null = null;
  let ipCity: string | null = null;
  let mismatch = false;

  if (clientIp && !isPrivateOrLocalIp(clientIp)) {
    const located = await locateIpViaAmap(clientIp);
    ipProvince = located?.province ?? null;
    ipCity = located?.city ?? null;

    const hasGpsRegion = Boolean(checkIn.addressProvince || checkIn.addressCity);
    const hasIpRegion = Boolean(ipProvince || ipCity);
    if (hasGpsRegion && hasIpRegion) {
      mismatch = regionsMismatch(
        { province: checkIn.addressProvince, city: checkIn.addressCity },
        { province: ipProvince, city: ipCity }
      );
    }
  }

  await prisma.salesCheckIn.update({
    where: { id: checkIn.id },
    data: {
      clientIp: clientIp || undefined,
      ipProvince: ipProvince || undefined,
      ipCity: ipCity || undefined,
      locationIpMismatch: mismatch,
    },
  });

  if (!mismatch) return;

  const gpsText = [checkIn.addressProvince, checkIn.addressCity, checkIn.addressDistrict]
    .filter(Boolean)
    .join("") || checkIn.locationText || "未知定位";
  const ipText = [ipProvince, ipCity].filter(Boolean).join("") || "未知";
  const customerPart = checkIn.customer?.name
    ? `客户「${checkIn.customer.name}」`
    : isAutoDailyLogCheckIn(checkIn)
      ? "写日报时的定位打卡"
      : "无客户往来打卡";

  const whenLabel = isAutoDailyLogCheckIn(checkIn) ? "写日报打卡时" : "打卡时";

  await createAppNotification({
    type: NOTIFICATION_TYPES.CHECK_IN_LOCATION_IP_MISMATCH,
    title: "打卡定位与 IP 不一致",
    body: `${checkIn.user.name} 于${whenLabel} GPS 显示「${gpsText}」，设备 IP 归属「${ipText}」（${customerPart}）。请关注是否存在虚拟定位。`,
    linkHref: "/sales-log",
    meta: {
      checkInId: checkIn.id,
      userId: checkIn.userId,
      clientIp,
      gpsText,
      ipText,
      autoDailyLogCheckIn: isAutoDailyLogCheckIn(checkIn),
    },
  });
}
