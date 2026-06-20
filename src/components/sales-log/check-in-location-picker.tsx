"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ResolvedCheckInLocation } from "@/lib/amap/types";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";

export type CheckInLocationValue = ResolvedCheckInLocation;

type Props = {
  value: CheckInLocationValue | null;
  onChange: (value: CheckInLocationValue | null) => void;
  mapKey: string | null;
  disabled?: boolean;
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

export function CheckInLocationPicker({ value, onChange, mapKey, disabled }: Props) {
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
    setLocating(true);
    setError(null);
    try {
      if (!navigator.geolocation) {
        throw new Error("当前浏览器不支持定位，请允许位置权限");
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const res = await fetch("/api/geo/reverse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          coordType: "wgs84",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "地址解析失败");
      }

      onChange(data as CheckInLocationValue);
    } catch (e) {
      setError(e instanceof Error ? e.message : "定位失败");
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>定位与地图</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled || locating} onClick={handleLocate}>
          {locating ? "定位解析中…" : value ? "重新定位" : "获取定位并解析地址"}
        </Button>
      </div>

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

      {value ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            <span className="text-foreground/70">地点：</span>
            <span className="font-medium">{formatCheckInLocation(value)}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          点击按钮后系统将获取 GPS，并解析为完整地点（省市区街道门牌）。
        </p>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
