"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as echarts from "echarts/core";
import { MapChart, ScatterChart, EffectScatterChart, LinesChart } from "echarts/charts";
import {
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  formatChannelProvinceTooltip,
  type MapAnchorItem,
  type MapDashboardBundle,
  type MapLayerId,
  type MapSalesDayCard,
  type MapSalesPerson,
  type MapSalesStop,
} from "@/lib/admin/map-dashboard";
import type { ProvinceChannelRow } from "@/lib/admin/channel-dashboard";
import { CHANNEL_KIND_COVERAGE_KEYS } from "@/lib/customers/channel-kind";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/navigation/return-to";
import { DailyReportBody } from "@/components/daily-reports/daily-report-body";
import { ScrollChain } from "@/components/ui/scroll-chain";

echarts.use([
  MapChart,
  ScatterChart,
  EffectScatterChart,
  LinesChart,
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  CanvasRenderer,
]);

const LAYER_META: { id: MapLayerId; label: string; color: string }[] = [
  { id: "direct", label: "直接客户", color: "#2563eb" },
  { id: "channel", label: "渠道统计", color: "#16a34a" },
  { id: "opportunity", label: "商机", color: "#ea580c" },
  { id: "sales", label: "销售出差", color: "#7c3aed" },
];

const DIRECT_DOT_SIZE = 14;
/** 销售头像 ≈ 直接客户蓝点的 1.5 倍 */
const SALES_AVATAR_SIZE = Math.round(DIRECT_DOT_SIZE * 1.5);
/** 销售出差头像（圆形透明底，public/map/sales-avatar.png） */
const PERSON_SYMBOL = "image:///map/sales-avatar.png";

/** 轨迹点标签交替方位（备用；最终由环形引线布局接管） */
const TRACK_LABEL_SLOTS: Array<{
  position: "right" | "left" | "top" | "bottom";
  distance: number;
}> = [
  { position: "right", distance: 16 },
  { position: "left", distance: 16 },
  { position: "top", distance: 14 },
  { position: "bottom", distance: 14 },
  { position: "right", distance: 30 },
  { position: "left", distance: 30 },
  { position: "top", distance: 28 },
  { position: "bottom", distance: 28 },
];

/** 折线插密，放大后更顺滑 */
function densifyPolyline(
  coords: [number, number][],
  segmentsPerEdge = 20
): [number, number][] {
  if (coords.length < 2) return coords;
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    for (let s = 1; s <= segmentsPerEdge; s++) {
      const t = s / segmentsPerEdge;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return out;
}

/**
 * 用短实线段模拟虚线，避免 Canvas dashed 对角线锯齿过重。
 * 返回多条 lines 数据项。
 */
function dashedSegmentCoords(
  coords: [number, number][],
  dashCount = 10,
  gapRatio = 0.42
): Array<{ coords: [number, number][] }> {
  const dense = densifyPolyline(coords, Math.max(24, dashCount * 4));
  if (dense.length < 2) return [];
  const total = dense.length - 1;
  const period = Math.max(4, Math.floor(total / dashCount));
  const dashLen = Math.max(2, Math.floor(period * (1 - gapRatio)));
  const segments: Array<{ coords: [number, number][] }> = [];
  let i = 0;
  while (i < dense.length - 1) {
    const end = Math.min(i + dashLen, dense.length - 1);
    segments.push({ coords: dense.slice(i, end + 1) });
    i += period;
  }
  return segments;
}
function shortenGeoName(name: string) {
  return name
    .replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/u, "")
    .trim();
}

/** 按可见锚点范围放大并居中，默认比全国全览更大 */
function geoViewForAnchors(anchors: Array<{ lng: number; lat: number }>) {
  if (anchors.length === 0) {
    return { center: [108.5, 34] as [number, number], zoom: 1.55 };
  }
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const a of anchors) {
    minLng = Math.min(minLng, a.lng);
    maxLng = Math.max(maxLng, a.lng);
    minLat = Math.min(minLat, a.lat);
    maxLat = Math.max(maxLat, a.lat);
  }
  const pad = 1.6;
  minLng -= pad;
  maxLng += pad;
  minLat -= pad;
  maxLat += pad;
  const spanLng = Math.max(maxLng - minLng, 6);
  const spanLat = Math.max(maxLat - minLat, 5);
  const zoom = Math.min(3.4, Math.max(1.5, 52 / Math.max(spanLng, spanLat * 1.35)));
  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
    zoom,
  };
}

/** 点击销售后：只按该人行程点框选，尽量放大但仍完整可见 */
function geoViewForSalesTrack(anchors: Array<{ lng: number; lat: number }>) {
  if (anchors.length === 0) {
    return { center: [108.5, 34] as [number, number], zoom: 1.55 };
  }
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const a of anchors) {
    minLng = Math.min(minLng, a.lng);
    maxLng = Math.max(maxLng, a.lng);
    minLat = Math.min(minLat, a.lat);
    maxLat = Math.max(maxLat, a.lat);
  }
  const rawSpanLng = Math.max(maxLng - minLng, 0.05);
  const rawSpanLat = Math.max(maxLat - minLat, 0.05);
  // 小边距：点与线路刚好落在视野内
  const padLng = Math.max(rawSpanLng * 0.12, 0.08);
  const padLat = Math.max(rawSpanLat * 0.12, 0.07);
  minLng -= padLng;
  maxLng += padLng;
  minLat -= padLat;
  maxLat += padLat;
  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;
  const zoom = Math.min(
    22,
    Math.max(3.2, 48 / Math.max(spanLng, spanLat * 1.08))
  );
  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
    zoom,
  };
}

function formatCheckInTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateMapLabel(raw: string, max: number) {
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

type Selection =
  | { type: "anchor"; item: MapAnchorItem }
  | { type: "province"; row: ProvinceChannelRow }
  | {
      type: "sales-stop";
      person: MapSalesPerson;
      stop: MapSalesStop;
      /** 从某日卡片进入时，后退回到该日 */
      fromDay?: MapSalesDayCard;
    }
  | { type: "sales-day"; person: MapSalesPerson; day: MapSalesDayCard };

/** 日详情 / 打卡详情共用固定高度，避免切换时弹窗尺寸跳动 */
const MAP_FLOW_DIALOG_CLASS =
  "flex h-[min(72vh,560px)] max-h-[min(72vh,560px)] w-full max-w-lg flex-col overflow-hidden p-0";

type Props = {
  data: MapDashboardBundle;
  /** 从客户/往来页返回时恢复选中销售 */
  initialSalesId?: string | null;
};

export function MapDashboardClient({ data, initialSalesId = null }: Props) {
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>({
    direct: true,
    channel: true,
    opportunity: true,
    sales: true,
  });
  const [selected, setSelected] = useState<Selection | null>(null);
  const [activeSalesId, setActiveSalesId] = useState<string | null>(
    () =>
      initialSalesId && data.salesPeople.some((p) => p.id === initialSalesId)
        ? initialSalesId
        : null
  );
  const elRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelIndex = useMemo(() => {
    const m = new Map<string, ProvinceChannelRow>();
    for (const row of data.channelByProvince) m.set(row.province, row);
    return m;
  }, [data.channelByProvince]);

  const salesIndex = useMemo(() => {
    const m = new Map<string, MapSalesPerson>();
    for (const p of data.salesPeople) m.set(p.id, p);
    return m;
  }, [data.salesPeople]);

  const activeSales = activeSalesId ? salesIndex.get(activeSalesId) ?? null : null;

  const visibleAnchors = useMemo(
    () =>
      data.anchors.filter(
        (a) => (a.kind === "direct" && layers.direct) || (a.kind === "opportunity" && layers.opportunity)
      ),
    [data.anchors, layers]
  );

  useEffect(() => {
    if (!layers.sales) setActiveSalesId(null);
  }, [layers.sales]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/geo/china.json");
        if (!res.ok) throw new Error("地图数据加载失败");
        const geo = (await res.json()) as {
          features?: Array<{
            properties?: { name?: string; adcode?: string; adchar?: string };
          }>;
        };
        if (geo.features) {
          // 去掉九段线/南沙诸岛右下角小框
          geo.features = geo.features.filter(
            (f) =>
              f.properties?.adchar !== "JD" &&
              f.properties?.adcode !== "100000_JD"
          );
          for (const f of geo.features) {
            if (f.properties?.name) {
              f.properties.name = shortenGeoName(f.properties.name);
            }
          }
        }
        if (cancelled) return;
        echarts.registerMap("china", geo as Parameters<typeof echarts.registerMap>[1]);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "地图加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !elRef.current) return;
    const dpr =
      typeof window !== "undefined"
        ? Math.max(2, Math.min(3, window.devicePixelRatio || 1))
        : 2;
    const chart = echarts.init(elRef.current, undefined, {
      renderer: "canvas",
      devicePixelRatio: dpr,
    });

    const fitPoints: Array<{ lng: number; lat: number }> = [];
    let geoView: { center: [number, number]; zoom: number };
    if (activeSales) {
      for (const s of activeSales.stops) {
        fitPoints.push({ lng: s.lng, lat: s.lat });
      }
      if (fitPoints.length === 0) {
        fitPoints.push({ lng: activeSales.lng, lat: activeSales.lat });
      }
      geoView = geoViewForSalesTrack(fitPoints);
    } else {
      fitPoints.push(...visibleAnchors);
      if (layers.sales) {
        for (const p of data.salesPeople) {
          fitPoints.push({ lng: p.lng, lat: p.lat });
        }
      }
      geoView = geoViewForAnchors(fitPoints);
    }

    const directData = visibleAnchors
      .filter((a) => a.kind === "direct")
      .map((a) => ({
        name: a.name,
        value: [a.lng, a.lat],
        anchor: a,
      }));
    const oppData = visibleAnchors
      .filter((a) => a.kind === "opportunity")
      .map((a) => ({
        name: a.name,
        value: [a.lng, a.lat],
        anchor: a,
      }));

    const salesData = layers.sales
      ? data.salesPeople.map((p) => ({
          name: p.name,
          value: [p.lng, p.lat],
          salesPerson: p,
        }))
      : [];

    const planDashData =
      layers.sales && !activeSales
        ? data.salesPeople.flatMap((p) =>
            p.planLinks.flatMap((link) =>
              dashedSegmentCoords(
                [
                  [link.fromLng, link.fromLat],
                  [link.toLng, link.toLat],
                ],
                12,
                0.4
              ).map((seg) => ({
                ...seg,
                planTitle: link.planTitle,
                customerName: link.customerName,
                salesName: p.name,
              }))
            )
          )
        : [];

    const trackLineData =
      activeSales && activeSales.stops.length >= 2
        ? [
            {
              coords: densifyPolyline(
                activeSales.stops.map((s) => [s.lng, s.lat] as [number, number]),
                24
              ),
            },
          ]
        : [];

    const trackStopData = activeSales
      ? activeSales.stops.map((s, index) => {
          const slot = TRACK_LABEL_SLOTS[index % TRACK_LABEL_SLOTS.length];
          return {
            name: s.customerName ?? `打卡${index + 1}`,
            value: [s.lng, s.lat],
            salesStop: s,
            salesPerson: activeSales,
            stopIndex: index + 1,
            label: {
              position: slot.position,
              distance: slot.distance,
            },
          };
        })
      : [];
    const channelMapData = layers.channel
      ? data.channelByProvince.map((row) => {
          const value = Math.round(row.coverageScore * 100);
          return {
            name: row.province,
            value,
            row,
            // 有渠道着色的省份：边界加深，避免灰边看不清
            itemStyle: {
              borderColor: "#334155",
              borderWidth: 1.45,
            },
          };
        })
      : [];

    chart.setOption(
      {
        tooltip: {
          trigger: "item",
          // 挂到 body，避免被地图容器 overflow:hidden 裁切；再限制在视口内
          appendToBody: true,
          confine: true,
          enterable: true,
          extraCssText:
            "max-width:min(360px,calc(100vw - 24px));max-height:min(240px,calc(100vh - 24px));overflow:auto;white-space:normal;line-height:1.45;z-index:10000;",
          position: (
            point: number[],
            _params: unknown,
            _dom: HTMLElement | null,
            _rect: unknown,
            size: { contentSize: number[]; viewSize: number[] }
          ) => {
            const gap = 12;
            const [pw, ph] = size.contentSize;
            const [vw, vh] = size.viewSize;
            let x = point[0] + gap;
            let y = point[1] + gap;
            // 右侧放不下则改到左侧
            if (x + pw > vw - gap) x = point[0] - pw - gap;
            // 仍越界则贴边
            if (x < gap) x = gap;
            if (x + pw > vw - gap) x = Math.max(gap, vw - pw - gap);
            // 下方放不下则改到上方
            if (y + ph > vh - gap) y = point[1] - ph - gap;
            if (y < gap) y = gap;
            if (y + ph > vh - gap) y = Math.max(gap, vh - ph - gap);
            return [x, y];
          },
          formatter: (params: {
            seriesType?: string;
            seriesName?: string;
            name?: string;
            data?: {
              anchor?: MapAnchorItem;
              row?: ProvinceChannelRow;
              salesPerson?: MapSalesPerson;
              salesStop?: MapSalesStop;
              stopIndex?: number;
              name?: string;
            };
          }) => {
            if (params.data?.salesStop && params.data.salesPerson) {
              const s = params.data.salesStop;
              const contentBlock =
                s.contentKind === "followUp" && s.contentPreview
                  ? `往来：${escapeHtml(s.contentPreview)}`
                  : s.contentKind === "dailyLog" && s.contentPreview
                    ? `日志：${escapeHtml(s.contentPreview)}`
                    : s.contentKind === "followUp"
                      ? "暂无往来内容"
                      : s.contentKind === "dailyLog"
                        ? "暂无日志内容"
                        : "暂无往来/日志";
              return [
                `<strong>${escapeHtml(s.pointLabel)}</strong>`,
                formatCheckInTime(s.checkedInAt),
                contentBlock,
              ]
                .filter(Boolean)
                .join("<br/>");
            }
            if (params.data?.salesPerson) {
              const p = params.data.salesPerson;
              return [
                `<strong>${p.name}</strong>`,
                p.positionLabel,
                p.lastCity ? `位置 ${p.lastCity}` : null,
                p.planLinks.length > 0
                  ? `今日计划 ${p.planLinks.length} 个（虚线）`
                  : null,
                `${data.salesTrackWindowLabel}打卡 ${p.stopCount} 次`,
                "点击查看一周往来线路",
              ]
                .filter(Boolean)
                .join("<br/>");
            }
            if (params.data?.anchor) {
              const a = params.data.anchor;
              if (a.kind === "direct") {
                return [
                  `<strong>${a.name}</strong>`,
                  a.paymentLabel ? `回款 ${a.paymentLabel}` : null,
                  a.projectProgressPercent != null
                    ? `项目进度 ${a.projectProgressPercent}%`
                    : "项目进度 暂无关联项目",
                  a.salesOwnerName ? `负责销售 ${a.salesOwnerName}` : null,
                  "点击查看详情",
                ]
                  .filter(Boolean)
                  .join("<br/>");
              }
              return [
                `<strong>${a.name}</strong>`,
                a.subtitle,
                "点击查看详情",
              ]
                .filter(Boolean)
                .join("<br/>");
            }
            if (params.data?.row || (params.name && channelIndex.has(params.name))) {
              const row = params.data?.row ?? channelIndex.get(params.name ?? "");
              if (row) {
                return formatChannelProvinceTooltip(row, data.channelKindLabels);
              }
            }
            return params.name ?? "";
          },
        },
        visualMap: layers.channel
          ? {
              min: 0,
              max: 100,
              left: 16,
              bottom: 24,
              text: ["渠道覆盖完成", "未覆盖"],
              calculable: true,
              seriesIndex: 0,
              inRange: {
                color: ["#fecaca", "#fdba74", "#86efac", "#16a34a"],
              },
            }
          : undefined,
        geo: {
          map: "china",
          roam: true,
          center: geoView.center,
          zoom: geoView.zoom,
          scaleLimit: { min: 0.9, max: 36 },
          itemStyle: {
            areaColor: "#f8fafc",
            borderColor: "#94a3b8",
            borderWidth: 1.05,
          },
          emphasis: {
            itemStyle: {
              areaColor: "#e2e8f0",
              borderColor: "#64748b",
              borderWidth: 1.2,
            },
            label: { show: true },
          },
        },
        series: [
          layers.channel
            ? {
                name: "渠道覆盖",
                type: "map",
                geoIndex: 0,
                data: channelMapData,
                itemStyle: {
                  borderColor: "#64748b",
                  borderWidth: 1.1,
                },
                emphasis: {
                  label: { show: true },
                  itemStyle: {
                    borderColor: "#1e293b",
                    borderWidth: 1.5,
                  },
                },
                zlevel: 1,
              }
            : {
                name: "底图",
                type: "map",
                geoIndex: 0,
                data: [],
                silent: true,
                zlevel: 0,
              },
          layers.direct
            ? {
                name: LAYER_META[0].label,
                type: "effectScatter",
                coordinateSystem: "geo",
                data: directData,
                symbolSize: DIRECT_DOT_SIZE,
                showEffectOn: "emphasis",
                rippleEffect: { scale: 2.2 },
                itemStyle: { color: LAYER_META[0].color },
                label: {
                  show: true,
                  formatter: (p: { data?: { anchor?: MapAnchorItem } }) =>
                    p.data?.anchor?.name ?? "",
                  position: "right",
                  fontSize: 11,
                  color: "#1e3a8a",
                  backgroundColor: "rgba(255,255,255,0.85)",
                  padding: [2, 4],
                  borderRadius: 3,
                },
                zlevel: 2,
              }
            : null,
          layers.opportunity
            ? {
                name: LAYER_META[2].label,
                type: "scatter",
                coordinateSystem: "geo",
                data: oppData,
                symbolSize: 10,
                itemStyle: { color: LAYER_META[2].color },
                label: { show: false },
                zlevel: 3,
              }
            : null,
          layers.sales
            ? {
                name: LAYER_META[3].label,
                type: "scatter",
                coordinateSystem: "geo",
                data: salesData,
                symbol: PERSON_SYMBOL,
                symbolSize: SALES_AVATAR_SIZE,
                symbolKeepAspect: true,
                itemStyle: {
                  borderWidth: 0,
                  shadowBlur: 0,
                },
                label: {
                  show: true,
                  formatter: (p: { data?: { salesPerson?: MapSalesPerson } }) =>
                    p.data?.salesPerson?.name ?? "",
                  position: "bottom",
                  distance: 2,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#5b21b6",
                  backgroundColor: "rgba(255,255,255,0.96)",
                  padding: [1, 5],
                  borderRadius: 4,
                  borderColor: "#ddd6fe",
                  borderWidth: 1,
                },
                zlevel: 6,
              }
            : null,
          layers.sales && planDashData.length > 0
            ? {
                name: "今日计划虚线",
                type: "lines",
                coordinateSystem: "geo",
                data: planDashData,
                polyline: true,
                lineStyle: {
                  color: LAYER_META[3].color,
                  width: 2.2,
                  opacity: 0.82,
                  cap: "round",
                  join: "round",
                },
                silent: true,
                zlevel: 5,
              }
            : null,
          activeSales && trackLineData.length > 0
            ? {
                name: "一周往来线路",
                type: "lines",
                coordinateSystem: "geo",
                polyline: true,
                data: trackLineData,
                lineStyle: {
                  color: LAYER_META[3].color,
                  width: 3,
                  opacity: 0.9,
                  cap: "round",
                  join: "round",
                },
                effect: {
                  show: true,
                  period: 8,
                  trailLength: 0.18,
                  symbol: "circle",
                  symbolSize: 4,
                  color: LAYER_META[3].color,
                },
                silent: true,
                zlevel: 7,
              }
            : null,
          activeSales
            ? {
                name: "打卡点",
                type: "scatter",
                coordinateSystem: "geo",
                data: trackStopData,
                symbolSize: 11,
                itemStyle: {
                  color: "#fef3c7",
                  borderColor: LAYER_META[3].color,
                  borderWidth: 2,
                },
                label: {
                  show: true,
                  formatter: (p: {
                    data?: { salesStop?: MapSalesStop };
                  }) => {
                    const label = p.data?.salesStop?.pointLabel ?? "日志点";
                    return truncateMapLabel(label, 10);
                  },
                  fontSize: 10,
                  color: "#4c1d95",
                  backgroundColor: "rgba(255,255,255,0.95)",
                  padding: [3, 5],
                  borderRadius: 4,
                  borderColor: "#ddd6fe",
                  borderWidth: 1,
                },
                labelLine: {
                  show: true,
                  showAbove: true,
                  length2: 10,
                  minTurnAngle: 20,
                  lineStyle: {
                    color: "#a78bfa",
                    width: 1.2,
                    type: "solid",
                  },
                },
                labelLayout: (
                  params: {
                    dataIndex: number;
                    rect: { x: number; y: number; width: number; height: number };
                    labelRect: {
                      x: number;
                      y: number;
                      width: number;
                      height: number;
                    };
                  }
                ) => {
                  const n = Math.max(trackStopData.length, 1);
                  const i = params.dataIndex;
                  const cx = params.rect.x + params.rect.width / 2;
                  const cy = params.rect.y + params.rect.height / 2;
                  // 环形错开；点多时加大半径形成引线
                  const angle =
                    -Math.PI / 2 +
                    (i / n) * Math.PI * 2 +
                    (i % 2 === 0 ? -0.12 : 0.12);
                  const radius = 34 + (i % 5) * 16 + Math.floor(i / 8) * 10;
                  const tipX = cx + Math.cos(angle) * radius;
                  const tipY = cy + Math.sin(angle) * radius;
                  const align: "left" | "right" =
                    Math.cos(angle) >= 0 ? "left" : "right";
                  const x =
                    align === "left" ? tipX + 4 : tipX - params.labelRect.width - 4;
                  const y = tipY - params.labelRect.height / 2;
                  const midX = cx + Math.cos(angle) * Math.min(18, radius * 0.45);
                  const midY = cy + Math.sin(angle) * Math.min(18, radius * 0.45);
                  return {
                    x,
                    y,
                    align,
                    verticalAlign: "middle",
                    labelLinePoints: [
                      [cx, cy],
                      [midX, midY],
                      [tipX, tipY],
                    ],
                  };
                },
                zlevel: 8,
              }
            : null,
        ].filter(Boolean),
      },
      true
    );

    chart.off("click");
    chart.on("click", (params) => {
      const payload = params.data as
        | {
            anchor?: MapAnchorItem;
            row?: ProvinceChannelRow;
            salesPerson?: MapSalesPerson;
            salesStop?: MapSalesStop;
          }
        | undefined;

      if (payload?.salesStop && payload.salesPerson) {
        setSelected({
          type: "sales-stop",
          person: payload.salesPerson,
          stop: payload.salesStop,
        });
        return;
      }
      if (payload?.salesPerson) {
        setActiveSalesId((prev) =>
          prev === payload.salesPerson!.id ? null : payload.salesPerson!.id
        );
        setSelected(null);
        return;
      }
      const anchor = payload?.anchor;
      if (anchor) {
        setSelected({ type: "anchor", item: anchor });
        return;
      }
      if (layers.channel) {
        const row =
          payload?.row ?? channelIndex.get(String(params.name ?? ""));
        if (row) setSelected({ type: "province", row });
      }
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [
    ready,
    visibleAnchors,
    layers,
    data.channelByProvince,
    data.channelKindLabels,
    data.salesPeople,
    data.salesTrackWindowLabel,
    channelIndex,
    activeSales,
  ]);

  function toggleLayer(id: MapLayerId) {
    setLayers((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next.direct && !next.channel && !next.opportunity && !next.sales) return prev;
      return next;
    });
  }

  function layerCount(id: MapLayerId) {
    if (id === "direct") return data.totals.direct;
    if (id === "channel") return data.totals.channel;
    if (id === "opportunity") return data.totals.opportunity;
    return data.totals.sales;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {LAYER_META.map((layer) => (
            <label
              key={layer.id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                layers[layer.id] ? "border-primary/40 bg-primary/5" : "opacity-60"
              )}
            >
              <input
                type="checkbox"
                className="size-4 rounded border"
                checked={layers[layer.id]}
                onChange={() => toggleLayer(layer.id)}
              />
              <span
                className={cn(
                  "inline-flex items-center justify-center",
                  layer.id === "sales" ? "size-3.5" : "size-2.5 rounded-full"
                )}
                style={
                  layer.id === "sales" ? undefined : { backgroundColor: layer.color }
                }
                aria-hidden
              >
                {layer.id === "sales" ? (
                  <img
                    src="/map/sales-avatar.png"
                    alt=""
                    className="size-4 rounded-full object-cover"
                    width={16}
                    height={16}
                  />
                ) : null}
              </span>
              {layer.label}
              <span className="tabular-nums text-muted-foreground">
                {layerCount(layer.id)}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          销售小人：优先今日往来打卡；若无则昨日位置 + 虚线连今日计划。点击小人看一周往来线路。未定位{" "}
          {data.totals.unlocated} 条。
        </p>
      </div>

      {activeSales ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium text-violet-900">{activeSales.name}</span>
              <span className="ml-2 text-violet-700">
                {data.salesTrackWindowLabel}往来 · 工作日查看 · 当前「
                {activeSales.positionLabel}」
              </span>
            </div>
            <button
              type="button"
              className="text-xs text-violet-700 underline"
              onClick={() => setActiveSalesId(null)}
            >
              关闭轨迹
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {activeSales.dayCards.map((day) => {
              const empty = day.visits.length === 0 && day.logPoints.length === 0;
              return (
                <button
                  key={day.ymd}
                  type="button"
                  disabled={empty}
                  className={cn(
                    // 固定约 4 行高（日期 + 最多 3 条）；超出内容区内滚动
                    "flex h-[6.25rem] flex-col rounded-md border px-2.5 py-1.5 text-left shadow-sm transition",
                    day.isToday
                      ? "border-violet-400 bg-white ring-1 ring-violet-300"
                      : "border-violet-200/80 bg-white/90",
                    empty
                      ? "cursor-default opacity-60"
                      : "hover:border-violet-400 hover:bg-white"
                  )}
                  onClick={() => {
                    if (empty) return;
                    setSelected({
                      type: "sales-day",
                      person: activeSales,
                      day,
                    });
                  }}
                >
                  <div
                    className={cn(
                      "h-4 shrink-0 truncate text-[11px] font-medium leading-4",
                      day.isToday ? "text-violet-800" : "text-violet-600"
                    )}
                  >
                    {day.dateLabel}
                  </div>
                  <ScrollChain className="mt-1 min-h-0 flex-1 overflow-y-auto">
                    {empty ? (
                      <p className="text-[11px] text-muted-foreground">无行程</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {day.visits.map((v) => (
                          <li
                            key={v.stopId}
                            className="truncate text-[11px] leading-snug text-violet-950"
                            title={v.customerName}
                          >
                            <span
                              className={cn(
                                "mr-1 inline-block rounded px-1 py-px text-[9px] font-medium",
                                v.customerKind === "channel"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-sky-100 text-sky-800"
                              )}
                            >
                              {v.customerKind === "channel" ? "渠道" : "客户"}
                            </span>
                            {v.customerName}
                          </li>
                        ))}
                        {day.logPoints.map((lp) => (
                          <li
                            key={lp.stopId}
                            className="truncate text-[11px] leading-snug text-amber-900"
                            title={`日志 · ${lp.locationLabel}`}
                          >
                            <span className="mr-1 inline-block rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-900">
                              日志
                            </span>
                            {lp.locationLabel}
                          </li>
                        ))}
                      </ul>
                    )}
                  </ScrollChain>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="relative w-full overflow-hidden rounded-lg border bg-card">
        {error ? (
          <div className="flex h-[min(78vh,860px)] min-h-[560px] items-center justify-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <>
            {!ready ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
                地图加载中…
              </div>
            ) : null}
            <div ref={elRef} className="h-[min(78vh,860px)] min-h-[560px] w-full" />
          </>
        )}
      </div>

      {selected?.type === "anchor" ? (
        <AnchorDialog
          item={selected.item}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selected?.type === "province" ? (
        <ProvinceChannelDialog
          row={selected.row}
          kindLabels={data.channelKindLabels}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selected?.type === "sales-stop" ? (
        <SalesStopDialog
          person={selected.person}
          stop={selected.stop}
          windowLabel={data.salesTrackWindowLabel}
          mapReturnTo={
            activeSalesId
              ? `/admin/map?sales=${encodeURIComponent(activeSalesId)}`
              : "/admin/map"
          }
          onBack={
            selected.fromDay
              ? () =>
                  setSelected({
                    type: "sales-day",
                    person: selected.person,
                    day: selected.fromDay!,
                  })
              : undefined
          }
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selected?.type === "sales-day" ? (
        <SalesDayDialog
          person={selected.person}
          day={selected.day}
          onClose={() => setSelected(null)}
          onOpenStop={(stop) =>
            setSelected({
              type: "sales-stop",
              person: selected.person,
              stop,
              fromDay: selected.day,
            })
          }
        />
      ) : null}
    </div>
  );
}




function AnchorDialog({
  item,
  onClose,
}: {
  item: MapAnchorItem;
  onClose: () => void;
}) {
  if (item.kind === "direct") {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" scrollable>
          <DialogHeader>
            <DialogTitle>{item.name}</DialogTitle>
            <DialogDescription className="sr-only">直接客户详情</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <dl className="space-y-2">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">回款情况</dt>
                <dd className="tabular-nums font-medium">{item.paymentLabel ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">项目进度</dt>
                <dd>
                  {item.projectProgressPercent != null
                    ? `${item.projectProgressPercent}%`
                    : "暂无关联项目"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">负责销售</dt>
                <dd>{item.salesOwnerName ?? "—"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
              <Link href={item.href} className="text-primary hover:underline">
                打开客户
              </Link>
              {(item.contracts ?? []).map((c) => (
                <Link key={c.id} href={c.href} className="text-primary hover:underline">
                  {item.contracts && item.contracts.length > 1
                    ? `打开合同：${c.title}`
                    : "打开合同"}
                </Link>
              ))}
            </div>
            {item.opportunities && item.opportunities.length > 0 ? (
              <div className="space-y-2 border-t pt-3">
                <h3 className="font-semibold">关联商机</h3>
                <ul className="space-y-1.5">
                  {item.opportunities.map((o) => (
                    <li key={o.id}>
                      <Link href={o.href} className="text-primary hover:underline">
                        {o.title}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ¥{Math.round(o.expectedAmount).toLocaleString("zh-CN")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" scrollable>
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>商机</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {item.subtitle ? (
            <p className="text-muted-foreground">{item.subtitle}</p>
          ) : null}
          <p>
            <Link href={item.href} className="text-primary hover:underline">
              打开商机详情
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProvinceChannelDialog({
  row,
  kindLabels,
  onClose,
}: {
  row: ProvinceChannelRow;
  kindLabels: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto" scrollable>
        <DialogHeader>
          <DialogTitle>{row.province} · 渠道覆盖</DialogTitle>
          <DialogDescription>
            {row.isCovered ? "三类目标已达标" : `覆盖进度 ${row.metKinds}/3`}
            ，不打渠道锚点，仅统计。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ul className="space-y-2">
            {CHANNEL_KIND_COVERAGE_KEYS.map((k) => {
              const c = row.coverage[k];
              return (
                <li
                  key={k}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2",
                    !c.met && "border-red-200 bg-red-50"
                  )}
                >
                  <span>{kindLabels[k] ?? k}</span>
                  <span className="tabular-nums font-medium">
                    {c.actual}/{c.target}
                    {!c.met ? (
                      <span className="ml-1 text-xs text-red-600">差{c.gap}</span>
                    ) : (
                      <span className="ml-1 text-xs text-emerald-700">达标</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            其他 {row.otherCount} · 合计归因 {row.total} · 活跃 {row.activeCount} · 沉寂{" "}
            {row.inactiveCount}
          </p>
          <p>
            <Link
              href="/admin/stats/channels"
              className="text-sm text-primary hover:underline"
            >
              打开渠道覆盖表
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SalesDayDialog({
  person,
  day,
  onClose,
  onOpenStop,
}: {
  person: MapSalesPerson;
  day: MapSalesDayCard;
  onClose: () => void;
  onOpenStop: (stop: MapSalesStop) => void;
}) {
  const stopById = new Map(person.stops.map((s) => [s.id, s]));
  const dayStops = day.stopIds
    .map((id) => stopById.get(id))
    .filter(Boolean) as MapSalesStop[];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={MAP_FLOW_DIALOG_CLASS}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-6 py-4">
            <DialogHeader>
              <DialogTitle>
                {person.name} · {day.dateLabel}
              </DialogTitle>
              <DialogDescription>
                当日往来与日志 · 共 {dayStops.length} 次打卡
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {dayStops.length === 0 ? (
              <p className="text-sm text-muted-foreground">当日无行程</p>
            ) : (
              dayStops.map((stop) => {
                const kindLabel =
                  stop.contentKind === "followUp"
                    ? "往来"
                    : stop.contentKind === "dailyLog"
                      ? "日志"
                      : "打卡";
                const preview =
                  stop.contentPreview ??
                  stop.content ??
                  (stop.contentKind === "followUp"
                    ? "暂无往来内容"
                    : stop.contentKind === "dailyLog"
                      ? "暂无日志内容"
                      : "暂无正文");
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className="w-full rounded-md border bg-card px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50/40"
                    onClick={() => onOpenStop(stop)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {stop.pointLabel}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          stop.contentKind === "followUp"
                            ? "bg-sky-100 text-sky-800"
                            : stop.contentKind === "dailyLog"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {kindLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatCheckInTime(stop.checkedInAt)}
                      {stop.customerKind === "channel" ? " · 渠道" : null}
                      {stop.customerKind === "direct" ? " · 客户" : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/80">
                      {preview}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SalesStopDialog({
  person,
  stop,
  windowLabel,
  mapReturnTo,
  onBack,
  onClose,
}: {
  person: MapSalesPerson;
  stop: MapSalesStop;
  windowLabel: string;
  mapReturnTo: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const contentTitle =
    stop.contentKind === "followUp"
      ? "往来"
      : stop.contentKind === "dailyLog"
        ? "日志"
        : "内容";
  const contentBody =
    stop.content ??
    (stop.contentKind === "followUp"
      ? "暂无往来内容"
      : stop.contentKind === "dailyLog"
        ? "暂无日志内容"
        : "暂无往来/日志");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (onBack) onBack();
          else onClose();
        }
      }}
    >
      <DialogContent
        className={MAP_FLOW_DIALOG_CLASS}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 border-b px-6 py-4">
            <button
              type="button"
              className="text-sm text-violet-700 outline-none underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
              onClick={() => {
                if (onBack) onBack();
                else onClose();
              }}
            >
              {onBack ? "← 返回当日行程" : "← 返回"}
            </button>
            <DialogHeader>
              <DialogTitle>
                {person.name} · {stop.pointLabel}
              </DialogTitle>
              <DialogDescription>
                {windowLabel}出差打卡 · {formatCheckInTime(stop.checkedInAt)}
                {stop.locationLabel && stop.pointLabel === "日志点"
                  ? ` · ${stop.regionLabel}`
                  : null}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
            <div className="space-y-3">
              {stop.customerName ? (
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-muted-foreground">
                    {stop.customerKind === "channel" ? "渠道" : "客户"}
                  </span>
                  <span>{stop.customerName}</span>
                </div>
              ) : null}
              <div>
                <div className="mb-2 text-muted-foreground">{contentTitle}</div>
                {stop.contentKind === "dailyLog" && stop.content ? (
                  <DailyReportBody content={stop.content} />
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {contentBody}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t px-6 py-3">
            {stop.customerHref ? (
              <Link
                href={withReturnTo(stop.customerHref, mapReturnTo)}
                className="text-primary hover:underline"
              >
                打开客户
              </Link>
            ) : null}
            {stop.followUpHref ? (
              <Link
                href={withReturnTo(stop.followUpHref, mapReturnTo)}
                className="text-primary hover:underline"
              >
                查看往来
              </Link>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
