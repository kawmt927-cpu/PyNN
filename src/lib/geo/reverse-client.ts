import type { ResolvedCheckInLocation } from "@/lib/amap/types";

export async function reverseGeocodeClient(input: {
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
