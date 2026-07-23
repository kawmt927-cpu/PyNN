"use client";

import { reverseGeocodeClient } from "@/lib/geo/reverse-client";
import { geolocationErrorMessage, getBrowserGeolocation } from "@/lib/geo/device-location";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import type { ResolvedCheckInLocation } from "@/lib/amap/types";

export type CapturedLocation = ResolvedCheckInLocation & {
  addressLabel: string;
};

async function resolveCapturedLocation(
  latitude: number,
  longitude: number,
  coordType: "wgs84" | "gcj02"
): Promise<CapturedLocation> {
  const resolved = await reverseGeocodeClient({ latitude, longitude, coordType });
  const addressLabel = formatCheckInLocation(resolved);
  return {
    ...resolved,
    addressLabel:
      addressLabel !== "—"
        ? addressLabel
        : resolved.locationText || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
}

/** 企微或浏览器自动取定位（供销售日志拟稿确认阶段使用） */
export async function captureMobileLocation(options: {
  wecomReady: boolean;
  getWeComLocation?: () => Promise<{ latitude: number; longitude: number }>;
}): Promise<CapturedLocation> {
  if (options.wecomReady && options.getWeComLocation) {
    const { latitude, longitude } = await options.getWeComLocation();
    return resolveCapturedLocation(latitude, longitude, "gcj02");
  }
  const pos = await getBrowserGeolocation();
  return resolveCapturedLocation(pos.coords.latitude, pos.coords.longitude, "wgs84");
}

export function formatLocationCaptureError(error: unknown): string {
  return geolocationErrorMessage(error);
}

/** 助理是否在请销售确认完整拟稿 */
export function isSalesLogDraftConfirmationRequest(content: string): boolean {
  const text = content.trim();
  if (!text || text.length < 40) return false;
  return /请核对|请确认|无误请|回复确认|确认后.*(写入|记进)|以上是今日总结|准备写入 CRM|记进系统|帮忙看一眼|拟落库/.test(
    text
  );
}
