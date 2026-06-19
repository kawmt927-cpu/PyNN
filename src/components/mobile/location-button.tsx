"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

type Props = {
  disabled?: boolean;
  wecomReady: boolean;
  onGetWeComLocation: () => Promise<{ latitude: number; longitude: number }>;
  onLocation: (text: string) => void;
};

export function LocationButton({
  disabled,
  wecomReady,
  onGetWeComLocation,
  onLocation,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      if (wecomReady) {
        const { latitude, longitude } = await onGetWeComLocation();
        onLocation(`[当前定位: 纬度 ${latitude.toFixed(6)}, 经度 ${longitude.toFixed(6)}]`);
        return;
      }

      if (!navigator.geolocation) {
        throw new Error("当前环境不支持定位");
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = pos.coords;
      onLocation(`[当前定位: 纬度 ${latitude.toFixed(6)}, 经度 ${longitude.toFixed(6)}]`);
    } catch (e) {
      onLocation(
        `[定位失败: ${e instanceof Error ? e.message : "无法获取位置，请在企业微信中授权定位"}]`
      );
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
      <MapPin className="h-4 w-4" />
    </Button>
  );
}
