import { prisma } from "@/lib/prisma";
import { maskApiKey } from "@/lib/agent/config";

export type EffectiveAmapConfig = {
  webServiceKey: string | null;
  jsKey: string | null;
};

export type AmapConfigView = {
  webServiceKeyConfigured: boolean;
  webServiceKeyMask: string;
  jsKeyConfigured: boolean;
  jsKeyMask: string;
  /** 地址解析是否可用（Web 服务 Key） */
  geocodeReady: boolean;
  /** 地图展示是否可用（JS API Key） */
  mapReady: boolean;
};

function envWebServiceKey(): string | null {
  return (
    process.env.AMAP_WEB_SERVICE_KEY?.trim() ||
    process.env.AMAP_KEY?.trim() ||
    null
  );
}

function envJsKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_AMAP_WEB_KEY?.trim() ||
    process.env.NEXT_PUBLIC_AMAP_KEY?.trim() ||
    null
  );
}

export async function getAmapConfigRow() {
  return prisma.amapConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export async function getEffectiveAmapConfig(): Promise<EffectiveAmapConfig> {
  const row = await getAmapConfigRow();
  return {
    webServiceKey: row.webServiceKey?.trim() || envWebServiceKey(),
    jsKey: row.jsKey?.trim() || envJsKey(),
  };
}

export async function getAmapConfigForAdmin(): Promise<AmapConfigView> {
  const row = await getAmapConfigRow();
  const effective = await getEffectiveAmapConfig();
  const dbWeb = row.webServiceKey?.trim() || null;
  const dbJs = row.jsKey?.trim() || null;

  return {
    webServiceKeyConfigured: Boolean(dbWeb || envWebServiceKey()),
    webServiceKeyMask: maskApiKey(dbWeb || envWebServiceKey()),
    jsKeyConfigured: Boolean(dbJs || envJsKey()),
    jsKeyMask: maskApiKey(dbJs || envJsKey()),
    geocodeReady: Boolean(effective.webServiceKey),
    mapReady: Boolean(effective.jsKey),
  };
}

/** @deprecated 请使用 getEffectiveAmapConfig() */
export function getAmapWebServiceKey(): string | null {
  return envWebServiceKey();
}

/** @deprecated 请使用 getEffectiveAmapConfig() */
export function getAmapJsKey(): string | null {
  return envJsKey();
}

/** @deprecated 请使用 getEffectiveAmapConfig() */
export function isAmapConfigured() {
  return Boolean(envWebServiceKey());
}

/** @deprecated 请使用 getEffectiveAmapConfig() */
export function isAmapMapEnabled() {
  return Boolean(envJsKey());
}
