import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CONFIG_CATEGORY } from "@/lib/config-options";

/** 漏斗最底层「已签约」虚拟阶段 key */
export const FUNNEL_SIGNED_KEY = "__SIGNED__";

export type FunnelLayer = {
  key: string;
  label: string;
  count: number;
  totalAmount: number;
  kind: "stage" | "signed";
};

type FunnelRow = {
  stage: string;
  count: number;
  totalAmount: Prisma.Decimal;
};

/**
 * 销售漏斗：按系统配置商机阶段 sortOrder 自上而下排列未签约各阶段，
 * 最下方固定「已签约」。不含已放弃。
 */
export async function getOpportunityFunnelSummary(
  accessWhere: Prisma.OpportunityWhereInput = {}
): Promise<FunnelLayer[]> {
  const stageOptions = await prisma.configOption.findMany({
    where: { category: CONFIG_CATEGORY.OPPORTUNITY_STAGE, enabled: true },
    // 漏斗自上而下：序号大的在上（靠前阶段），序号小的在下（接近成单），最底为已签约
    orderBy: [{ sortOrder: "desc" }, { label: "asc" }],
    select: { value: true, label: true, sortOrder: true },
  });

  const [stageRows, signedAgg] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ["stage"],
      where: {
        AND: [accessWhere, { status: "NOT_SIGNED" }],
      },
      _count: { _all: true },
      _sum: { expectedAmount: true },
    }),
    prisma.opportunity.aggregate({
      where: {
        AND: [accessWhere, { status: "SIGNED" }],
      },
      _count: { _all: true },
      _sum: { expectedAmount: true },
    }),
  ]);

  const byStage = new Map(
    stageRows.map((row) => [
      row.stage,
      {
        stage: row.stage,
        count: row._count._all,
        totalAmount: row._sum.expectedAmount ?? new Prisma.Decimal(0),
      } satisfies FunnelRow,
    ])
  );

  const knownValues = new Set(stageOptions.map((s) => s.value));
  const layers: FunnelLayer[] = stageOptions.map((stage) => {
    const row = byStage.get(stage.value);
    return {
      key: stage.value,
      label: stage.label,
      count: row?.count ?? 0,
      totalAmount: row ? Number(row.totalAmount) : 0,
      kind: "stage" as const,
    };
  });

  // 配置外但仍有数据的阶段，插在已签约之前
  const extras = [...byStage.values()]
    .filter((row) => !knownValues.has(row.stage))
    .sort((a, b) => a.stage.localeCompare(b.stage, "zh-CN"));
  for (const row of extras) {
    layers.push({
      key: row.stage,
      label: row.stage,
      count: row.count,
      totalAmount: Number(row.totalAmount),
      kind: "stage",
    });
  }

  layers.push({
    key: FUNNEL_SIGNED_KEY,
    label: "已签约",
    count: signedAgg._count._all,
    totalAmount: Number(signedAgg._sum.expectedAmount ?? 0),
    kind: "signed",
  });

  return layers;
}

export function formatAmount(amount: Prisma.Decimal | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(n);
}

/** 以「万」为单位展示金额，如 820000 → 82万、82500 → 8.25万 */
export function formatAmountInWan(amount: Prisma.Decimal | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "—";
  const wan = n / 10000;
  const text = Number.isInteger(wan)
    ? String(wan)
    : wan.toFixed(2).replace(/\.?0+$/, "");
  return `${text}万`;
}
