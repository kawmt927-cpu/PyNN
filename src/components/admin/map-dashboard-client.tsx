"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as echarts from "echarts/core";
import { MapChart, ScatterChart, EffectScatterChart } from "echarts/charts";
import {
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  formatChannelProvinceTooltip,
  type MapAnchorItem,
  type MapDashboardBundle,
  type MapLayerId,
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

echarts.use([
  MapChart,
  ScatterChart,
  EffectScatterChart,
  TooltipComponent,
  VisualMapComponent,
  GeoComponent,
  LegendComponent,
  CanvasRenderer,
]);

const LAYER_META: { id: MapLayerId; label: string; color: string }[] = [
  { id: "direct", label: "直接客户", color: "#2563eb" },
  { id: "channel", label: "渠道统计", color: "#16a34a" },
  { id: "opportunity", label: "商机", color: "#ea580c" },
];

function shortenGeoName(name: string) {
  return name
    .replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/u, "")
    .trim();
}

type Props = { data: MapDashboardBundle };

type Selection =
  | { type: "anchor"; item: MapAnchorItem }
  | { type: "province"; row: ProvinceChannelRow };

export function MapDashboardClient({ data }: Props) {
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>({
    direct: true,
    channel: true,
    opportunity: true,
  });
  const [selected, setSelected] = useState<Selection | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelIndex = useMemo(() => {
    const m = new Map<string, ProvinceChannelRow>();
    for (const row of data.channelByProvince) m.set(row.province, row);
    return m;
  }, [data.channelByProvince]);

  const visibleAnchors = useMemo(
    () =>
      data.anchors.filter(
        (a) => (a.kind === "direct" && layers.direct) || (a.kind === "opportunity" && layers.opportunity)
      ),
    [data.anchors, layers]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/geo/china.json");
        if (!res.ok) throw new Error("地图数据加载失败");
        const geo = (await res.json()) as {
          features?: Array<{ properties?: { name?: string } }>;
        };
        if (geo.features) {
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
    const chart = echarts.init(elRef.current);

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

    const channelMapData = layers.channel
      ? data.channelByProvince.map((row) => ({
          name: row.province,
          value: Math.round(row.coverageScore * 100),
          row,
        }))
      : [];

    chart.setOption(
      {
        tooltip: {
          trigger: "item",
          formatter: (params: {
            seriesType?: string;
            seriesName?: string;
            name?: string;
            data?: {
              anchor?: MapAnchorItem;
              row?: ProvinceChannelRow;
              name?: string;
            };
          }) => {
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
        legend: {
          data: [
            layers.channel ? "渠道覆盖" : null,
            layers.direct ? LAYER_META[0].label : null,
            layers.opportunity ? LAYER_META[2].label : null,
          ].filter(Boolean) as string[],
          top: 8,
          left: "center",
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
          scaleLimit: { min: 0.8, max: 8 },
          itemStyle: {
            areaColor: "#f8fafc",
            borderColor: "#cbd5e1",
          },
          emphasis: {
            itemStyle: { areaColor: "#e2e8f0" },
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
                emphasis: { label: { show: true } },
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
                symbolSize: 14,
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
                label: {
                  show: false,
                },
                zlevel: 3,
              }
            : null,
        ].filter(Boolean),
      },
      true
    );

    chart.off("click");
    chart.on("click", (params) => {
      const anchor = (params.data as { anchor?: MapAnchorItem } | undefined)?.anchor;
      if (anchor) {
        setSelected({ type: "anchor", item: anchor });
        return;
      }
      if (layers.channel) {
        const row =
          (params.data as { row?: ProvinceChannelRow } | undefined)?.row ??
          channelIndex.get(String(params.name ?? ""));
        if (row) setSelected({ type: "province", row });
      }
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [ready, visibleAnchors, layers, data.channelByProvince, data.channelKindLabels, channelIndex]);

  function toggleLayer(id: MapLayerId) {
    setLayers((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next.direct && !next.channel && !next.opportunity) return prev;
      return next;
    });
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
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              {layer.label}
              <span className="tabular-nums text-muted-foreground">
                {layer.id === "direct"
                  ? data.totals.direct
                  : layer.id === "channel"
                    ? data.totals.channel
                    : data.totals.opportunity}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          渠道：省域着色看覆盖统计（不打锚点）。直接客户：锚点旁显示客户名称。未定位{" "}
          {data.totals.unlocated} 条。
        </p>
      </div>

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
