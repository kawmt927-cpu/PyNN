import { formatAmountInWan, type FunnelLayer } from "@/lib/opportunities/funnel";
import { cn } from "@/lib/utils";

type Props = {
  layers: FunnelLayer[];
};

/** 层宽百分比：自上而下线性收窄，相邻层顶底对齐形成连续斜边 */
function layerWidthPercent(index: number, total: number) {
  if (total <= 1) return 96;
  const top = 100;
  const bottom = 46;
  return top - ((top - bottom) * index) / (total - 1);
}

function stageTone(index: number, total: number, kind: FunnelLayer["kind"]) {
  if (kind === "signed") {
    return "bg-emerald-600 text-white";
  }
  const t = total <= 1 ? 0 : index / Math.max(total - 2, 1);
  if (t < 0.34) return "bg-sky-700 text-white";
  if (t < 0.67) return "bg-sky-600 text-white";
  return "bg-sky-500 text-white";
}

export function OpportunityFunnelSummary({ layers }: Props) {
  if (layers.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无漏斗数据。</p>;
  }

  const totalCount = layers.reduce((sum, row) => sum + row.count, 0);
  const totalAmount = layers.reduce((sum, row) => sum + row.totalAmount, 0);
  const n = layers.length;

  return (
    <div className="space-y-3">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-1.5">
        {layers.map((layer, index) => {
          const widthTop = layerWidthPercent(index, n);
          const widthBottom =
            index === n - 1
              ? Math.max(widthTop - 8, 38)
              : layerWidthPercent(index + 1, n);
          const insetTop = (100 - widthTop) / 2;
          const insetBottom = (100 - widthBottom) / 2;

          return (
            <div
              key={layer.key}
              className="w-full"
              style={{
                clipPath: `polygon(${insetTop}% 0%, ${100 - insetTop}% 0%, ${100 - insetBottom}% 100%, ${insetBottom}% 100%)`,
              }}
              title={`${layer.label}：${layer.count} 个商机 · ${formatAmountInWan(layer.totalAmount)}`}
            >
              <div
                className={cn(
                  "flex h-9 items-center justify-center gap-2 px-6 text-center sm:h-10 sm:gap-3 sm:px-10",
                  stageTone(index, n, layer.kind)
                )}
              >
                <span className="truncate text-sm font-medium tracking-wide">
                  {layer.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums opacity-95">
                  {layer.count} 个 · {formatAmountInWan(layer.totalAmount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
        <span>
          合计商机{" "}
          <span className="font-medium tabular-nums text-foreground">{totalCount}</span>
        </span>
        <span>
          金额合计{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatAmountInWan(totalAmount)}
          </span>
        </span>
      </div>
    </div>
  );
}
