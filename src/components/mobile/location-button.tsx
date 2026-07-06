"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { reverseGeocodeClient } from "@/lib/geo/reverse-client";
import { geolocationErrorMessage, getBrowserGeolocation } from "@/lib/geo/device-location";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";

type Props = {
  disabled?: boolean;
  wecomReady: boolean;
  onGetWeComLocation: () => Promise<{ latitude: number; longitude: number }>;
  onLocation: (text: string) => void;
  onStatus?: (text: string | null) => void;
};

async function formatResolvedLocation(
  latitude: number,
  longitude: number,
  coordType: "wgs84" | "gcj02"
): Promise<string> {
  const resolved = await reverseGeocodeClient({ latitude, longitude, coordType });
  const address = formatCheckInLocation(resolved);
  if (address !== "—") {
    return `[当前定位: ${address}]`;
  }
  return `[当前定位: ${resolved.locationText || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`}]`;
}

export function LocationButton({
  disabled,
  wecomReady,
  onGetWeComLocation,
  onLocation,
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
        onLocation(await formatResolvedLocation(latitude, longitude, "gcj02"));
        onStatus?.("定位已插入输入框");
        return;
      }

      const pos = await getBrowserGeolocation();
      const { latitude, longitude } = pos.coords;
      onStatus?.("正在解析地址…");
      onLocation(await formatResolvedLocation(latitude, longitude, "wgs84"));
      onStatus?.("定位已插入输入框");
    } catch (e) {
      const message = geolocationErrorMessage(e);
      onLocation(`[定位失败: ${message}]`);
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
      title="插入当前定位"
      aria-label="插入当前定位"
    >
      <MapPin className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
    </Button>
  );
}
