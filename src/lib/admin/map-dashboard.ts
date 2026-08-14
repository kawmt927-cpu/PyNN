import { prisma } from "@/lib/prisma";
import { CONFIG_CATEGORY, getConfigOptions, labelForConfig } from "@/lib/config-options";
import {
  getChannelDashboardBundle,
  normalizeProvinceName,
  UNASSIGNED_PROVINCE,
  type ProvinceChannelRow,
} from "@/lib/admin/channel-dashboard";
import {
  CHANNEL_KIND_COVERAGE_KEYS,
  type ChannelCoverageTargets,
} from "@/lib/customers/channel-kind";
import { jitterAnchor, resolveAnchorGeo } from "@/lib/geo/china-centroids";
import { sumPaymentRecords } from "@/lib/contracts/payment-waterfall";
import { formatAmountInWan } from "@/lib/opportunities/funnel";

/** 勾选图层：渠道仅省域统计，不打锚点 */
export type MapLayerId = "direct" | "channel" | "opportunity";

export type MapAnchorContractSummary = {
  id: string;
  title: string;
  href: string;
  paymentLabel: string;
  projectProgressPercent: number | null;
};

export type MapAnchorItem = {
  id: string;
  kind: "direct" | "opportunity";
  /** 展示名：直接客户/商机均优先客户名称；无客户时商机回退标题 */
  name: string;
  province: string;
  city: string | null;
  lng: number;
  lat: number;
  approx: boolean;
  href: string;
  subtitle?: string;
  /** 直接客户弹窗 */
  salesOwnerName?: string | null;
  paymentLabel?: string | null;
  projectProgressPercent?: number | null;
  contracts?: MapAnchorContractSummary[];
  opportunities?: Array<{
    id: string;
    title: string;
    href: string;
    expectedAmount: number;
  }>;
};

export type MapDashboardBundle = {
  anchors: MapAnchorItem[];
  /** 各省渠道覆盖统计（与统计管理同源） */
  channelByProvince: ProvinceChannelRow[];
  channelTargets: ChannelCoverageTargets;
  channelKindLabels: Record<string, string>;
  totals: {
    direct: number;
    channel: number;
    opportunity: number;
    opportunityOnMap: number;
    unlocated: number;
  };
  stageLabels: Record<string, string>;
};

const ACTIVE_CONTRACT_STATUSES = [
  "PENDING_APPROVAL",
  "PENDING_SIGN",
  "SIGNED_PENDING_IMPL",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
] as const;

export async function getMapDashboardBundle(): Promise<MapDashboardBundle> {
  const [stageOptions, kindOptions, channelBundle, contracts, opportunities] =
    await Promise.all([
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_KIND),
      getChannelDashboardBundle(),
      prisma.contract.findMany({
        where: { status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
        select: {
          id: true,
          title: true,
          totalAmount: true,
          paymentRecords: { select: { amount: true } },
          project: { select: { id: true, progressPercent: true } },
          owner: { select: { name: true } },
          endUserCustomer: {
            select: {
              id: true,
              name: true,
              province: true,
              city: true,
              district: true,
              owner: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.opportunity.findMany({
        where: { status: { in: ["NOT_SIGNED", "SIGNED"] } },
        select: {
          id: true,
          title: true,
          stage: true,
          expectedAmount: true,
          customerId: true,
          customer: {
            select: { id: true, name: true, province: true, city: true, district: true },
          },
          owner: { select: { name: true } },
          parties: {
            select: {
              role: true,
              customer: {
                select: { id: true, name: true, province: true, city: true, district: true },
              },
            },
          },
          contracts: {
            where: { status: { in: [...ACTIVE_CONTRACT_STATUSES] } },
            select: {
              endUserCustomer: {
                select: {
                  id: true,
                  name: true,
                  province: true,
                  city: true,
                  district: true,
                },
              },
            },
            take: 1,
          },
        },
      }),
    ]);

  const stageLabels = Object.fromEntries(stageOptions.map((o) => [o.value, o.label]));
  const channelKindLabels = Object.fromEntries(kindOptions.map((o) => [o.value, o.label]));

  const endUserMap = new Map<
    string,
    {
      id: string;
      name: string;
      province: string;
      city: string | null;
      district: string | null;
      salesOwnerName: string | null;
      paidAmount: number;
      totalAmount: number;
      contracts: MapAnchorContractSummary[];
      /** 有关联项目时取最近更新合同上的进度；多项目时取进度最高 */
      projectProgressPercent: number | null;
    }
  >();

  for (const c of contracts) {
    const eu = c.endUserCustomer;
    const province = normalizeProvinceName(eu.province);
    const paid = Math.min(sumPaymentRecords(c.paymentRecords), Number(c.totalAmount));
    const total = Number(c.totalAmount);
    const progress = c.project?.progressPercent ?? null;
    const contractSummary: MapAnchorContractSummary = {
      id: c.id,
      title: c.title,
      href: `/contracts/${c.id}`,
      paymentLabel: `${formatAmountInWan(paid)}/${formatAmountInWan(total)}`,
      projectProgressPercent: progress,
    };

    const existing = endUserMap.get(eu.id);
    if (existing) {
      existing.paidAmount += paid;
      existing.totalAmount += total;
      existing.contracts.push(contractSummary);
      if (progress != null) {
        existing.projectProgressPercent =
          existing.projectProgressPercent == null
            ? progress
            : Math.max(existing.projectProgressPercent, progress);
      }
      if (!existing.salesOwnerName) {
        existing.salesOwnerName = eu.owner?.name ?? c.owner.name;
      }
      continue;
    }
    endUserMap.set(eu.id, {
      id: eu.id,
      name: eu.name,
      province,
      city: eu.city,
      district: eu.district,
      salesOwnerName: eu.owner?.name ?? c.owner.name,
      paidAmount: paid,
      totalAmount: total,
      contracts: [contractSummary],
      projectProgressPercent: progress,
    });
  }

  const oppsByEndUser = new Map<
    string,
    Array<{ id: string; title: string; href: string; expectedAmount: number }>
  >();
  const standaloneOpps: Array<{
    id: string;
    title: string;
    province: string;
    city: string | null;
    district: string | null;
    customerName: string | null;
    ownerName: string;
    stage: string;
    expectedAmount: number;
  }> = [];

  for (const o of opportunities) {
    const amount = Number(o.expectedAmount);
    const linkedEndUserId =
      o.contracts[0]?.endUserCustomer.id ??
      (o.customerId && endUserMap.has(o.customerId) ? o.customerId : null);

    if (linkedEndUserId && endUserMap.has(linkedEndUserId)) {
      const list = oppsByEndUser.get(linkedEndUserId) ?? [];
      list.push({
        id: o.id,
        title: o.title,
        href: `/opportunities/${o.id}`,
        expectedAmount: amount,
      });
      oppsByEndUser.set(linkedEndUserId, list);
      continue;
    }

    const locCustomer =
      o.contracts[0]?.endUserCustomer ??
      o.customer ??
      o.parties.find((p) => p.role === "PRIMARY")?.customer ??
      o.parties.find((p) => p.role !== "CHANNEL")?.customer ??
      o.parties[0]?.customer ??
      null;
    standaloneOpps.push({
      id: o.id,
      title: o.title,
      province: normalizeProvinceName(locCustomer?.province),
      city: locCustomer?.city ?? null,
      district: locCustomer?.district ?? null,
      customerName: locCustomer?.name ?? null,
      ownerName: o.owner.name,
      stage: o.stage,
      expectedAmount: amount,
    });
  }

  const anchors: MapAnchorItem[] = [];
  let unlocated = 0;

  type DirectRow = {
    id: string;
    name: string;
    province: string;
    city: string | null;
    district: string | null;
    salesOwnerName: string | null;
    paidAmount: number;
    totalAmount: number;
    contracts: MapAnchorContractSummary[];
    projectProgressPercent: number | null;
  };
  type LocatedDirect = {
    item: DirectRow;
    geo: NonNullable<ReturnType<typeof resolveAnchorGeo>>;
  };
  const directsLocated: LocatedDirect[] = [];
  for (const d of endUserMap.values()) {
    if (d.province === UNASSIGNED_PROVINCE) {
      unlocated += 1;
      continue;
    }
    const geo = resolveAnchorGeo({
      province: d.province,
      city: d.city,
      district: d.district,
    });
    if (!geo) {
      unlocated += 1;
      continue;
    }
    directsLocated.push({ item: d, geo });
  }

  const directsByGroup = new Map<string, LocatedDirect[]>();
  for (const row of directsLocated) {
    const list = directsByGroup.get(row.geo.groupKey) ?? [];
    list.push(row);
    directsByGroup.set(row.geo.groupKey, list);
  }

  for (const list of directsByGroup.values()) {
    list.forEach((row, index) => {
      const d = row.item;
      const point = jitterAnchor(row.geo, index, list.length, row.geo.precision);
      const paymentLabel = `${formatAmountInWan(d.paidAmount)}/${formatAmountInWan(d.totalAmount)}`;
      anchors.push({
        id: `direct-${d.id}`,
        kind: "direct",
        name: d.name,
        province: d.province,
        city: d.city,
        lng: point.lng,
        lat: point.lat,
        approx: true,
        href: `/customers/${d.id}`,
        salesOwnerName: d.salesOwnerName,
        paymentLabel,
        projectProgressPercent: d.projectProgressPercent,
        contracts: d.contracts,
        opportunities: oppsByEndUser.get(d.id) ?? [],
      });
    });
  }

  type LocatedOpp = {
    item: (typeof standaloneOpps)[number];
    geo: NonNullable<ReturnType<typeof resolveAnchorGeo>>;
  };
  const oppsLocated: LocatedOpp[] = [];
  for (const o of standaloneOpps) {
    if (o.province === UNASSIGNED_PROVINCE) {
      unlocated += 1;
      continue;
    }
    const geo = resolveAnchorGeo({
      province: o.province,
      city: o.city,
      district: o.district,
    });
    if (!geo) {
      unlocated += 1;
      continue;
    }
    oppsLocated.push({ item: o, geo });
  }

  const oppsByGroup = new Map<string, LocatedOpp[]>();
  for (const row of oppsLocated) {
    const list = oppsByGroup.get(row.geo.groupKey) ?? [];
    list.push(row);
    oppsByGroup.set(row.geo.groupKey, list);
  }

  let opportunityOnMap = 0;
  for (const list of oppsByGroup.values()) {
    list.forEach((row, index) => {
      const o = row.item;
      const point = jitterAnchor(row.geo, index, list.length, row.geo.precision);
      opportunityOnMap += 1;
      anchors.push({
        id: `opp-${o.id}`,
        kind: "opportunity",
        name: o.customerName ?? o.title,
        province: o.province,
        city: o.city,
        lng: point.lng,
        lat: point.lat,
        approx: true,
        href: `/opportunities/${o.id}`,
        subtitle: [
          o.customerName ? o.title : null,
          o.ownerName,
          labelForConfig(stageLabels, o.stage),
          `¥${Math.round(o.expectedAmount).toLocaleString("zh-CN")}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });
  }

  const nestedOppCount = [...oppsByEndUser.values()].reduce((s, a) => s + a.length, 0);

  return {
    anchors,
    channelByProvince: channelBundle.byProvince.filter(
      (p) => p.province !== UNASSIGNED_PROVINCE
    ),
    channelTargets: channelBundle.targets,
    channelKindLabels,
    totals: {
      direct: endUserMap.size,
      channel: channelBundle.totals.customers,
      opportunity: opportunities.length,
      opportunityOnMap: opportunityOnMap + nestedOppCount,
      unlocated,
    },
    stageLabels,
  };
}

export function formatChannelProvinceTooltip(
  row: ProvinceChannelRow,
  kindLabels: Record<string, string>
): string {
  const lines = CHANNEL_KIND_COVERAGE_KEYS.map((k) => {
    const c = row.coverage[k];
    const label = kindLabels[k] ?? k;
    return `${label} ${c.actual}/${c.target}${c.met ? " ✓" : `（差${c.gap}）`}`;
  });
  return [
    `<strong>${row.province} · 渠道覆盖</strong>`,
    `覆盖 ${row.metKinds}/3 ${row.isCovered ? "已达标" : "未达标"}`,
    ...lines,
    `其他 ${row.otherCount} · 活跃 ${row.activeCount} · 沉寂 ${row.inactiveCount}`,
  ].join("<br/>");
}
