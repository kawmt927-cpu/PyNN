import { centroidForCity, normalizePlaceName } from "@/lib/geo/china-city-centroids";

/** 中国省级行政区短名 → 大致中心点（用于地图锚点近似落位） */
export const PROVINCE_CENTROIDS: Record<string, { lng: number; lat: number }> = {
  北京: { lng: 116.4074, lat: 39.9042 },
  天津: { lng: 117.201, lat: 39.0842 },
  河北: { lng: 114.5149, lat: 38.0428 },
  山西: { lng: 112.5489, lat: 37.8706 },
  内蒙古: { lng: 111.6708, lat: 40.8183 },
  辽宁: { lng: 123.4315, lat: 41.8057 },
  吉林: { lng: 125.3245, lat: 43.8868 },
  黑龙江: { lng: 126.535, lat: 45.8023 },
  上海: { lng: 121.4737, lat: 31.2304 },
  江苏: { lng: 118.7969, lat: 32.0603 },
  浙江: { lng: 120.1551, lat: 30.2741 },
  安徽: { lng: 117.2272, lat: 31.8206 },
  福建: { lng: 119.2965, lat: 26.0745 },
  江西: { lng: 115.8581, lat: 28.6832 },
  山东: { lng: 117.0009, lat: 36.6758 },
  河南: { lng: 113.6254, lat: 34.7466 },
  湖北: { lng: 114.3055, lat: 30.5928 },
  湖南: { lng: 112.9388, lat: 28.2282 },
  广东: { lng: 113.2644, lat: 23.1291 },
  广西: { lng: 108.3669, lat: 22.817 },
  海南: { lng: 110.3312, lat: 20.0311 },
  重庆: { lng: 106.5516, lat: 29.563 },
  四川: { lng: 104.0665, lat: 30.5723 },
  贵州: { lng: 106.6302, lat: 26.6477 },
  云南: { lng: 102.8329, lat: 24.8801 },
  西藏: { lng: 91.1409, lat: 29.6456 },
  陕西: { lng: 108.9398, lat: 34.3416 },
  甘肃: { lng: 103.8343, lat: 36.0611 },
  青海: { lng: 101.7802, lat: 36.6209 },
  宁夏: { lng: 106.2309, lat: 38.4872 },
  新疆: { lng: 87.6168, lat: 43.8256 },
  台湾: { lng: 121.5201, lat: 25.0307 },
  香港: { lng: 114.1694, lat: 22.3193 },
  澳门: { lng: 113.5439, lat: 22.1987 },
};

/** 可选覆盖省列表（表单勾选） */
export const COVERAGE_PROVINCE_OPTIONS = Object.keys(PROVINCE_CENTROIDS);

export function centroidForProvince(province: string): { lng: number; lat: number } | null {
  return PROVINCE_CENTROIDS[province] ?? null;
}

export type AnchorGeoPrecision = "district" | "city" | "province";

export type ResolvedAnchorGeo = {
  lng: number;
  lat: number;
  /** 用于同城错开分组 */
  groupKey: string;
  precision: AnchorGeoPrecision;
  placeLabel: string;
};

/**
 * 优先区县/县级市 → 地级市 → 省中心。
 * 例：化州市人民医院（市=茂名、区=化州）落在化州，而非广东中心。
 */
export function resolveAnchorGeo(input: {
  province: string;
  city?: string | null;
  district?: string | null;
}): ResolvedAnchorGeo | null {
  const districtKey = normalizePlaceName(input.district);
  if (districtKey) {
    const point = centroidForCity(districtKey);
    if (point) {
      return {
        ...point,
        groupKey: `d:${districtKey}`,
        precision: "district",
        placeLabel: districtKey,
      };
    }
  }

  const cityKey = normalizePlaceName(input.city);
  if (cityKey) {
    const point = centroidForCity(cityKey);
    if (point) {
      return {
        ...point,
        groupKey: `c:${cityKey}`,
        precision: "city",
        placeLabel: cityKey,
      };
    }
  }

  const provincePoint = centroidForProvince(input.province);
  if (!provincePoint) return null;
  return {
    ...provincePoint,
    groupKey: `p:${input.province}`,
    precision: "province",
    placeLabel: input.province,
  };
}

/** 同组多点轻微错开，避免完全重叠 */
export function jitterAnchor(
  base: { lng: number; lat: number },
  index: number,
  total: number,
  /** 市/区落点用更小半径，省落点略大 */
  precision: AnchorGeoPrecision = "province"
): { lng: number; lat: number } {
  if (total <= 1) return base;
  const angle = (index / total) * Math.PI * 2;
  const baseRadius = precision === "province" ? 0.35 : precision === "city" ? 0.12 : 0.06;
  const radius = baseRadius + (index % 3) * (baseRadius * 0.35);
  return {
    lng: base.lng + Math.cos(angle) * radius,
    lat: base.lat + Math.sin(angle) * radius * 0.8,
  };
}
