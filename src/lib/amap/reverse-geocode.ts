import { getEffectiveAmapConfig } from "@/lib/amap/config";
import type { ResolvedCheckInLocation } from "@/lib/amap/types";

type AmapConvertResponse = {
  status: string;
  info: string;
  locations?: string;
};

type AmapRegeoResponse = {
  status: string;
  info: string;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: {
      province?: string;
      city?: string | string[];
      district?: string;
      township?: string;
      streetNumber?: {
        street?: string;
        number?: string;
      };
    };
  };
};

function pickCity(city: string | string[] | undefined, province: string): string {
  if (Array.isArray(city)) return city[0] ?? province;
  if (city && city.length > 0 && !Array.isArray(city)) return city;
  // 直辖市等 city 可能为空
  return province;
}

function buildStreet(component: NonNullable<AmapRegeoResponse["regeocode"]>["addressComponent"]) {
  const parts: string[] = [];
  if (component?.township) parts.push(component.township);
  const street = component?.streetNumber?.street;
  const number = component?.streetNumber?.number;
  if (street) parts.push(number ? `${street}${number}` : street);
  else if (number) parts.push(number);
  return parts.join("");
}

async function amapFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`高德 API 请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** WGS84（浏览器 GPS）→ GCJ-02（高德） */
async function convertWgs84ToGcj02(
  latitude: number,
  longitude: number,
  key: string
): Promise<{ latitude: number; longitude: number }> {
  const locations = `${longitude},${latitude}`;
  const url = new URL("https://restapi.amap.com/v3/assistant/coordinate/convert");
  url.searchParams.set("key", key);
  url.searchParams.set("locations", locations);
  url.searchParams.set("coordsys", "gps");
  url.searchParams.set("output", "JSON");

  const data = await amapFetch<AmapConvertResponse>(url.toString());
  if (data.status !== "1" || !data.locations) {
    throw new Error(data.info || "坐标转换失败");
  }

  const [lng, lat] = data.locations.split(",").map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error("坐标转换结果无效");
  }
  return { latitude: lat, longitude: lng };
}

async function reverseGeocodeGcj02(
  latitude: number,
  longitude: number,
  key: string
): Promise<ResolvedCheckInLocation> {
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${longitude},${latitude}`);
  url.searchParams.set("extensions", "all");
  url.searchParams.set("radius", "200");
  url.searchParams.set("output", "JSON");

  const data = await amapFetch<AmapRegeoResponse>(url.toString());
  if (data.status !== "1" || !data.regeocode) {
    throw new Error(data.info || "逆地理编码失败");
  }

  const component = data.regeocode.addressComponent ?? {};
  const province = component.province?.trim() || "";
  const city = pickCity(component.city, province);
  const district = component.district?.trim() || "";
  const addressStreet = buildStreet(component);
  const formatted = data.regeocode.formatted_address?.trim() || "";
  const locationText =
    formatted ||
    [province, city, district, addressStreet].filter(Boolean).join("");

  if (!locationText) {
    throw new Error("未能解析出详细地址");
  }

  return {
    latitude,
    longitude,
    locationText,
    addressProvince: province,
    addressCity: city,
    addressDistrict: district,
    addressStreet,
  };
}

export async function resolveCheckInLocation(input: {
  latitude: number;
  longitude: number;
  /** 浏览器 GPS 为 wgs84；企微 SDK 为 gcj02 */
  coordType?: "wgs84" | "gcj02";
  /** 测试连接时可传入，否则从系统配置读取 */
  webServiceKey?: string;
}): Promise<ResolvedCheckInLocation> {
  const key =
    input.webServiceKey?.trim() ||
    (await getEffectiveAmapConfig()).webServiceKey;
  if (!key) {
    throw new Error(
      "未配置高德地图 Web 服务 Key，请管理员在系统配置 → 打卡定位中设置"
    );
  }

  let { latitude, longitude } = input;
  if (input.coordType !== "gcj02") {
    ({ latitude, longitude } = await convertWgs84ToGcj02(latitude, longitude, key));
  }

  return reverseGeocodeGcj02(latitude, longitude, key);
}
