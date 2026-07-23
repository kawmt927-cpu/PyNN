import { getEffectiveAmapConfig } from "@/lib/amap/config";

export type IpLocateResult = {
  province: string | null;
  city: string | null;
};

type AmapIpResponse = {
  status?: string;
  info?: string;
  province?: string | string[];
  city?: string | string[];
};

function asText(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const joined = value.filter(Boolean).join("").trim();
    return joined || null;
  }
  const text = value?.trim();
  return text && text !== "[]" ? text : null;
}

/** 高德 IP 定位（服务端）。 */
export async function locateIpViaAmap(ip: string): Promise<IpLocateResult | null> {
  const { webServiceKey } = await getEffectiveAmapConfig();
  if (!webServiceKey) return null;

  const url = new URL("https://restapi.amap.com/v3/ip");
  url.searchParams.set("ip", ip);
  url.searchParams.set("key", webServiceKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as AmapIpResponse;
    if (data.status !== "1") return null;
    return {
      province: asText(data.province),
      city: asText(data.city),
    };
  } catch {
    return null;
  }
}
