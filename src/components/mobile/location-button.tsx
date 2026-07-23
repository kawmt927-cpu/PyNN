"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { reverseGeocodeClient } from "@/lib/geo/reverse-client";
import { geolocationErrorMessage, getBrowserGeolocation } from "@/lib/geo/device-location";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import type { ResolvedCheckInLocation } from "@/lib/amap/types";

export type CapturedLocation = ResolvedCheckInLocation & {
  addressLabel: string;
};

type Props = {
  disabled?: boolean;
  wecomReady: boolean;
  onGetWeComLocation: () => Promise<{ latitude: number; longitude: number }>;
  /** 定位成功（含逆地理）；不写入输入框 */
  onLocated: (location: CapturedLocation) => void;
  /** 定位失败，仅提示，不写入输入框 */
  onError?: (message: string) => void;
  onStatus?: (text: string | null) => void;
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

export function LocationButton({
  disabled,
  wecomReady,
  onGetWeComLocation,
  onLocated,
  onError,
  onStatus,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    onStatus?.("正在获取定位…");
    try {
      if (wecomReady) {
        const { latitude, longitude } = await onGetWeComLocation();
        onStatus?.("正在解析地址…");
        onLocated(await resolveCapturedLocation(latitude, longitude, "gcj02"));
        onStatus?.(null);
        return;
      }

      const pos = await getBrowserGeolocation();
      const { latitude, longitude } = pos.coords;
      onStatus?.("正在解析地址…");
      onLocated(await resolveCapturedLocation(latitude, longitude, "wgs84"));
      onStatus?.(null);
    } catch (e) {
      const message = geolocationErrorMessage(e);
      onError?.(message);
      onStatus?.(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled || loading}
      onClick={handleClick}
      title="获取当前定位"
      aria-label="获取当前定位"
    >
      <MapPin className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
    </Button>
  );
}
