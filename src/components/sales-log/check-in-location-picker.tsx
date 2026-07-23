"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ResolvedCheckInLocation } from "@/lib/amap/types";
import {
  geolocationErrorMessage,
  getBrowserGeolocation,
  isSecureLocationContext,
} from "@/lib/geo/device-location";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { isWeComClient, useWeComSdk } from "@/hooks/use-wecom-sdk";

export type CheckInLocationValue = ResolvedCheckInLocation;

type Props = {
  value: CheckInLocationValue | null;
  onChange: (value: CheckInLocationValue | null) => void;
  mapKey: string | null;
  geocodeReady?: boolean;
  disabled?: boolean;
  /** 往来打卡时定位可选 */
  optional?: boolean;
  /** 已跳过定位 */
  skipped?: boolean;
  /** 可选定位时跳过（PC 端无引导条时必需） */
  onSkip?: () => void;
};

function loadAmapScript(key: string) {
  return new Promise<typeof AMap>((resolve, reject) => {
    if (window.AMap) {
      resolve(window.AMap);
      return;
    }
    const existing = document.getElementById("amap-js-sdk");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.AMap) resolve(window.AMap);
        else reject(new Error("地图加载失败"));
      });
      existing.addEventListener("error", () => reject(new Error("地图脚本加载失败")));
      return;
    }
    const script = document.createElement("script");
    script.id = "amap-js-sdk";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error("地图加载失败"));
    };
    script.onerror = () => reject(new Error("地图脚本加载失败"));
    document.head.appendChild(script);
  });
}

async function reverseGeocode(input: {
  latitude: number;
  longitude: number;
  coordType: "wgs84" | "gcj02";
}): Promise<ResolvedCheckInLocation> {
  const res = await fetch("/api/geo/reverse", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let data: { error?: string } & Partial<ResolvedCheckInLocation> = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    if (res.status === 401) {
      throw new Error("登录已过期，请刷新页面后重试");
    }
    throw new Error("地址解析服务异常，请稍后重试");
  }

  if (!res.ok) {
    throw new Error(data.error || "地址解析失败");
  }

  return data as ResolvedCheckInLocation;
}

export function CheckInLocationPicker({
  value,
  onChange,
  mapKey,
  geocodeReady = true,
  disabled,
  optional = false,
  skipped = false,
  onSkip,
}: Props) {
  const inWeCom = isWeComClient();
  const wecom = useWeComSdk(inWeCom);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const markerRef = useRef<AMap.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const updateMapPosition = useCallback((lng: number, lat: number) => {
    if (!mapRef.current || !window.AMap) return;
    mapRef.current.setCenter([lng, lat]);
    mapRef.current.setZoom(16);
    if (!markerRef.current) {
      markerRef.current = new window.AMap.Marker({
        position: [lng, lat],
        map: mapRef.current,
      });
    } else {
      markerRef.current.setPosition([lng, lat]);
    }
  }, []);

  const resolveAtCoordinates = useCallback(
    async (latitude: number, longitude: number, coordType: "wgs84" | "gcj02") => {
      const location = await reverseGeocode({ latitude, longitude, coordType });
      onChange(location);
    },
    [onChange]
  );

  useEffect(() => {
    if (!mapKey || !mapContainerRef.current || !value) return;

    let cancelled = false;

    loadAmapScript(mapKey)
      .then((AMap) => {
        if (cancelled || !mapContainerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new AMap.Map(mapContainerRef.current, {
            zoom: 16,
            center: [value.longitude, value.latitude],
            viewMode: "2D",
          });
        }
        updateMapPosition(value.longitude, value.latitude);
        setMapReady(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "地图初始化失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapKey, value, updateMapPosition]);

  useEffect(() => {
    if (value && mapRef.current) {
      updateMapPosition(value.longitude, value.latitude);
    }
  }, [value, updateMapPosition]);

  useEffect(() => {
    return () => {
      markerRef.current?.setMap(null);
      mapRef.current?.destroy();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  async function handleLocate() {
    if (!geocodeReady) {
      setError("未配置高德 Web 服务 Key，请联系管理员在系统配置 → 打卡定位中设置");
      return;
    }

    setLocating(true);
    setError(null);

    try {
      if (inWeCom) {
        if (wecom.error) {
          throw new Error(`企业微信定位不可用：${wecom.error}`);
        }
        if (!wecom.ready) {
          throw new Error("企业微信定位初始化中，请稍后再试");
        }
        const pos = await wecom.getLocation();
        await resolveAtCoordinates(pos.latitude, pos.longitude, "gcj02");
        return;
      }

      if (!isSecureLocationContext()) {
        throw new Error(
          "当前页面非安全连接，浏览器无法使用 GPS。请通过 https:// 或 localhost 访问"
        );
      }

      const pos = await getBrowserGeolocation();
      await resolveAtCoordinates(pos.coords.latitude, pos.coords.longitude, "wgs84");
    } catch (e) {
      setError(geolocationErrorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{optional ? "定位与地图（可选）" : "定位与地图"}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {optional && !value && onSkip ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || locating}
              onClick={onSkip}
            >
              {skipped ? "已跳过定位" : "暂时跳过定位"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || locating || !geocodeReady}
            onClick={handleLocate}
          >
            {locating ? "定位解析中…" : value ? "重新定位" : "获取定位并解析地址"}
          </Button>
        </div>
      </div>

      {!geocodeReady ? (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          未配置高德 Web 服务 Key，无法解析地址。请管理员在{" "}
          <a href="/admin/settings?tab=amap" className="font-medium underline">
            系统配置 → 打卡定位
          </a>{" "}
          中填写。
        </p>
      ) : null}

      {!mapKey ? (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          未配置地图展示 Key，仍可解析地址但无法显示地图。请管理员在{" "}
          <a href="/admin/settings?tab=amap" className="font-medium underline">
            系统配置 → 打卡定位
          </a>{" "}
          中填写 JS API Key。
        </p>
      ) : (
        <div
          ref={mapContainerRef}
          className="h-52 w-full overflow-hidden rounded-md border bg-muted"
          aria-label="打卡位置地图"
        >
          {!value && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              获取定位后将在此显示地图
            </div>
          )}
          {value && !mapReady && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              地图加载中…
            </div>
          )}
        </div>
      )}

      {inWeCom && geocodeReady ? (
        <p className="text-xs text-muted-foreground">企业微信内将用企微定位获取当前位置。</p>
      ) : null}

      {value ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            <span className="text-foreground/70">地点：</span>
            <span className="font-medium">{formatCheckInLocation(value)}</span>
          </p>
        </div>
      ) : skipped ? (
        <p className="text-sm text-muted-foreground">已跳过定位，提交时将不记录地点。</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {optional
            ? "可选。定位失败时可点「暂时跳过定位」，或直接提交后确认。"
            : "点击按钮后系统将获取 GPS，并解析为完整地点（省市区街道门牌）。"}
        </p>
      )}

      {error ? (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          {optional && onSkip && !skipped ? (
            <p className="text-xs text-muted-foreground">
              内置浏览器常无法定位。可点上方「暂时跳过定位」继续提交。
            </p>
          ) : null}
        </div>
      ) : null}

      {value ? (
        <>
          <input type="hidden" name="latitude" value={String(value.latitude)} />
          <input type="hidden" name="longitude" value={String(value.longitude)} />
          <input type="hidden" name="locationText" value={value.locationText} />
          <input type="hidden" name="addressProvince" value={value.addressProvince} />
          <input type="hidden" name="addressCity" value={value.addressCity} />
          <input type="hidden" name="addressDistrict" value={value.addressDistrict} />
          <input type="hidden" name="addressStreet" value={value.addressStreet} />
        </>
      ) : null}
    </div>
  );
}
