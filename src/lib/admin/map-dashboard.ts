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
import { AUTO_DAILY_LOG_CHECK_IN_NOTES } from "@/lib/sales-log/auto-log-check-in";
import { dailyReportPlainPreview } from "@/lib/sales-log/daily-report-format";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";
import type { ConfigOptionItem } from "@/lib/config-options";
import { sumPaymentRecords } from "@/lib/contracts/payment-waterfall";
import { formatAmountInWan } from "@/lib/opportunities/funnel";

/** 勾选图层：渠道仅省域统计，不打锚点；销售=近一周打卡 */
export type MapLayerId = "direct" | "channel" | "opportunity" | "sales";

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

/** 轨迹点正文来源：往来跟进 vs 销售日志 */
export type MapSalesStopContentKind = "followUp" | "dailyLog";

export type MapSalesCustomerKind = "direct" | "channel";

/** 销售本周打卡轨迹点（可带往来或日志） */
export type MapSalesStop = {
  id: string;
  checkedInAt: string;
  lng: number;
  lat: number;
  city: string | null;
  province: string | null;
  district: string | null;
  /** 区/县级地点（简短） */
  locationLabel: string;
  /** 省+市+区县（日志展示用） */
  regionLabel: string;
  /** 地图常显标签：客户名；无客户日志打卡则为「日志点」 */
  pointLabel: string;
  customerName: string | null;
  customerHref: string | null;
  /** 客户/渠道；无客户时为 null */
  customerKind: MapSalesCustomerKind | null;
  /**
   * @deprecated 兼容旧字段：等同 contentPreview
   */
  interaction: string | null;
  /** 完整正文（弹窗详情） */
  content: string | null;
  /** 列表/悬停摘要 */
  contentPreview: string | null;
  contentKind: MapSalesStopContentKind | null;
  followUpHref: string | null;
  /** 是否关联往来（跟进） */
  hasInteraction: boolean;
};

/** 按天汇总的行程卡片（本周自然周工作日，周一至周五） */
export type MapSalesDayCard = {
  ymd: string;
  dateLabel: string;
  isToday: boolean;
  /** 当天拜访的客户/渠道（去重，保留首次出现） */
  visits: Array<{
    customerName: string;
    customerKind: MapSalesCustomerKind;
    customerHref: string | null;
    stopId: string;
    hasFollowUp: boolean;
  }>;
  /** 无客户的日志打卡点（卡片显示完整省市区） */
  logPoints: Array<{
    stopId: string;
    /** 省+市+区县 */
    locationLabel: string;
    regionLabel: string;
    hasContent: boolean;
  }>;
  stopIds: string[];
};

export type MapSalesPlanLink = {
  planId: string;
  planTitle: string;
  fromLng: number;
  fromLat: number;
  toLng: number;
  toLat: number;
  customerName: string | null;
};

export type MapSalesPerson = {
  id: string;
  name: string;
  /** 默认落点（今日往来 → 昨日往来 → 今日计划） */
  lng: number;
  lat: number;
  positionSource: "today" | "yesterday" | "plan";
  positionLabel: string;
  lastCheckedInAt: string | null;
  lastCity: string | null;
  stopCount: number;
  /** 近一周打卡，按时间升序（点击后画轨迹） */
  stops: MapSalesStop[];
  /** 本周工作日卡片（周一→周五，含空日；默认不展示周末） */
  dayCards: MapSalesDayCard[];
  /** 今日尚无往来时：昨日位置 → 今日计划 虚线 */
  planLinks: MapSalesPlanLink[];
};

export type MapDashboardBundle = {
  anchors: MapAnchorItem[];
  salesPeople: MapSalesPerson[];
  /** 各省渠道覆盖统计（与统计管理同源） */
  channelByProvince: ProvinceChannelRow[];
  channelTargets: ChannelCoverageTargets;
  channelKindLabels: Record<string, string>;
  totals: {
    direct: number;
    channel: number;
    opportunity: number;
    opportunityOnMap: number;
    sales: number;
    unlocated: number;
  };
  /** 轨迹统计窗口说明，如「本周」 */
  salesTrackWindowLabel: string;
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

const SALES_TRACK_WORKDAYS = 5;

function shanghaiYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 上海日历日 [start, end) */
function shanghaiDayRange(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function shiftYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 0=周一 … 6=周日（按上海日历日） */
function weekdayMon0(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  // 当天 12:00 CST = 04:00 UTC，避免跨日
  const jsDay = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** 本周（自然周）周一的 ymd */
function startOfNaturalWeekYmd(todayYmd: string): string {
  return shiftYmd(todayYmd, -weekdayMon0(todayYmd));
}

/** 轨迹数据窗口：本周一 0 点起 */
function startOfSalesTrackWindow(now = new Date()) {
  const today = shanghaiYmd(now);
  return shanghaiDayRange(startOfNaturalWeekYmd(today)).start;
}

function truncateText(raw: string | null | undefined, max = 80) {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function fullText(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return s || null;
}

function resolveStopContent(row: CheckInRow): {
  content: string | null;
  contentPreview: string | null;
  contentKind: MapSalesStopContentKind | null;
  hasInteraction: boolean;
} {
  const followUpFull = fullText(row.followUp?.content);
  if (followUpFull) {
    return {
      content: followUpFull,
      contentPreview: truncateText(followUpFull, 100),
      contentKind: "followUp",
      hasInteraction: true,
    };
  }
  const reportFull = fullText(row.salesDailyLog?.dailyReport);
  if (reportFull) {
    return {
      content: reportFull,
      contentPreview: dailyReportPlainPreview(reportFull, 100),
      contentKind: "dailyLog",
      hasInteraction: false,
    };
  }
  const notes = (row.notes ?? "").trim();
  // 自动定位打卡备注对用户无信息量，不当作日志正文
  if (notes && notes !== AUTO_DAILY_LOG_CHECK_IN_NOTES) {
    return {
      content: notes,
      contentPreview: truncateText(notes, 100),
      contentKind: "dailyLog",
      hasInteraction: false,
    };
  }
  return {
    content: null,
    contentPreview: null,
    contentKind: null,
    hasInteraction: false,
  };
}

function ymdInShanghai(isoOrDate: Date) {
  return shanghaiYmd(isoOrDate);
}

type CheckInRow = {
  id: string;
  checkedInAt: Date;
  latitude: number | null;
  longitude: number | null;
  addressProvince: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  notes: string | null;
  user: { id: string; name: string };
  customer: {
    id: string;
    name: string;
    customerType: string | null;
  } | null;
  followUp: { id: string; content: string } | null;
  salesDailyLog: { id: string; dailyReport: string | null } | null;
};

/** 地图标签：优先区/县，否则市 */
export function formatStopLocationLabel(input: {
  addressDistrict?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
}): string {
  const district = input.addressDistrict?.trim();
  if (district) return district;
  const city = input.addressCity?.trim();
  if (city) return city;
  const province = input.addressProvince?.trim();
  if (province) return province;
  return "未知地点";
}

/** 日志地点：省+市+区县 */
export function formatStopRegionLabel(input: {
  addressProvince?: string | null;
  addressCity?: string | null;
  addressDistrict?: string | null;
}): string {
  const parts = [
    input.addressProvince?.trim(),
    input.addressCity?.trim(),
    input.addressDistrict?.trim(),
  ].filter(Boolean) as string[];
  if (parts.length === 0) return "未知地点";
  return parts.join("");
}

function formatDayCardLabel(ymd: string, todayYmd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  if (ymd === todayYmd) return `今天 ${m}/${d}`;
  const yesterday = shiftYmd(todayYmd, -1);
  if (ymd === yesterday) return `昨天 ${m}/${d}`;
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00+08:00`));
  return `${weekday} ${m}/${d}`;
}

export function buildSalesDayCards(
  stops: MapSalesStop[],
  todayYmd: string
): MapSalesDayCard[] {
  const byYmd = new Map<string, MapSalesStop[]>();
  for (const s of stops) {
    const ymd = ymdInShanghai(new Date(s.checkedInAt));
    const list = byYmd.get(ymd);
    if (list) list.push(s);
    else byYmd.set(ymd, [s]);
  }

  const weekStart = startOfNaturalWeekYmd(todayYmd);
  const cards: MapSalesDayCard[] = [];
  // 仅周一至周五（默认不展示周末）
  for (let i = 0; i < SALES_TRACK_WORKDAYS; i++) {
    const ymd = shiftYmd(weekStart, i);
    const dayStops = byYmd.get(ymd) ?? [];
    const visits: MapSalesDayCard["visits"] = [];
    const seenCustomer = new Set<string>();
    const logPoints: MapSalesDayCard["logPoints"] = [];

    for (const s of dayStops) {
      if (s.customerName && s.customerKind) {
        const key = s.customerHref ?? s.customerName;
        if (seenCustomer.has(key)) {
          // 同客户多次：若后来有往来则升级标记
          const existing = visits.find(
            (v) => (v.customerHref ?? v.customerName) === key
          );
          if (existing && s.hasInteraction) existing.hasFollowUp = true;
          continue;
        }
        seenCustomer.add(key);
        visits.push({
          customerName: s.customerName,
          customerKind: s.customerKind,
          customerHref: s.customerHref,
          stopId: s.id,
          hasFollowUp: s.hasInteraction,
        });
      } else if (s.contentKind === "dailyLog" || !s.customerName) {
        logPoints.push({
          stopId: s.id,
          locationLabel: s.regionLabel,
          regionLabel: s.regionLabel,
          hasContent: Boolean(s.content),
        });
      }
    }

    cards.push({
      ymd,
      dateLabel: formatDayCardLabel(ymd, todayYmd),
      isToday: ymd === todayYmd,
      visits,
      logPoints,
      stopIds: dayStops.map((s) => s.id),
    });
  }
  return cards;
}

type PlanRow = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  customer: {
    id: string;
    name: string;
    province: string | null;
    city: string | null;
    district: string | null;
  } | null;
};

function toStop(
  row: CheckInRow,
  typeOptions: ConfigOptionItem[]
): MapSalesStop | null {
  if (row.latitude == null || row.longitude == null) return null;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  const { content, contentPreview, contentKind, hasInteraction } =
    resolveStopContent(row);
  const locationLabel = formatStopLocationLabel({
    addressDistrict: row.addressDistrict,
    addressCity: row.addressCity,
    addressProvince: row.addressProvince,
  });
  const regionLabel = formatStopRegionLabel({
    addressProvince: row.addressProvince,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
  });
  const customerName = row.customer?.name?.trim() || null;
  const customerKind: MapSalesCustomerKind | null = row.customer
    ? isChannelCustomerType(row.customer.customerType, typeOptions)
      ? "channel"
      : "direct"
    : null;
  return {
    id: row.id,
    checkedInAt: row.checkedInAt.toISOString(),
    lng: row.longitude,
    lat: row.latitude,
    city: row.addressCity,
    province: row.addressProvince,
    district: row.addressDistrict,
    locationLabel,
    regionLabel,
    pointLabel: customerName ?? "日志点",
    customerName,
    customerHref: row.customer ? `/customers/${row.customer.id}` : null,
    customerKind,
    interaction: contentPreview,
    content,
    contentPreview,
    contentKind,
    followUpHref:
      row.followUp && row.customer
        ? `/customers/${row.customer.id}/follow-ups`
        : null,
    hasInteraction,
  };
}

/** 优先取当日有往来关联的打卡；没有往来则不算「当日往来」 */
function pickDayAnchor(stops: MapSalesStop[]): MapSalesStop | null {
  if (stops.length === 0) return null;
  const withIx = stops.filter((s) => s.hasInteraction);
  if (withIx.length > 0) return withIx[withIx.length - 1] ?? null;
  // 当日仅有打卡、尚无往来正文时，仍用最后一次打卡落点
  return stops[stops.length - 1] ?? null;
}

function buildSalesPeople(input: {
  checkIns: CheckInRow[];
  todayPlans: PlanRow[];
  todayYmd: string;
  yesterdayYmd: string;
  typeOptions: ConfigOptionItem[];
}): MapSalesPerson[] {
  const byUser = new Map<
    string,
    { name: string; stops: MapSalesStop[]; plans: PlanRow[] }
  >();

  for (const row of input.checkIns) {
    const stop = toStop(row, input.typeOptions);
    if (!stop) continue;
    const bucket = byUser.get(row.user.id);
    if (bucket) {
      bucket.stops.push(stop);
    } else {
      byUser.set(row.user.id, {
        name: row.user.name,
        stops: [stop],
        plans: [],
      });
    }
  }

  for (const plan of input.todayPlans) {
    if (!plan.customer) continue;
    const bucket = byUser.get(plan.assigneeId);
    if (bucket) {
      bucket.plans.push(plan);
      if (bucket.name === "销售") bucket.name = plan.assigneeName;
    } else {
      byUser.set(plan.assigneeId, {
        name: plan.assigneeName,
        stops: [],
        plans: [plan],
      });
    }
  }

  const people: MapSalesPerson[] = [];
  for (const [userId, bucket] of byUser) {
    bucket.stops.sort(
      (a, b) =>
        new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime()
    );

    const todayStops = bucket.stops.filter(
      (s) => ymdInShanghai(new Date(s.checkedInAt)) === input.todayYmd
    );
    const yesterdayStops = bucket.stops.filter(
      (s) => ymdInShanghai(new Date(s.checkedInAt)) === input.yesterdayYmd
    );

    const todayAnchor = pickDayAnchor(todayStops);
    const yesterdayAnchor = pickDayAnchor(yesterdayStops);

    const planPoints = bucket.plans
      .map((p) => {
        if (!p.customer) return null;
        const geo = resolveAnchorGeo({
          province: normalizeProvinceName(p.customer.province),
          city: p.customer.city,
          district: p.customer.district,
        });
        if (!geo) return null;
        return {
          planId: p.id,
          planTitle: p.title,
          lng: geo.lng,
          lat: geo.lat,
          customerName: p.customer.name,
        };
      })
      .filter(Boolean) as Array<{
      planId: string;
      planTitle: string;
      lng: number;
      lat: number;
      customerName: string;
    }>;

    let lng: number;
    let lat: number;
    let positionSource: MapSalesPerson["positionSource"];
    let positionLabel: string;
    let lastCity: string | null;
    let lastCheckedInAt: string | null;
    const planLinks: MapSalesPlanLink[] = [];

    if (todayAnchor) {
      lng = todayAnchor.lng;
      lat = todayAnchor.lat;
      positionSource = "today";
      positionLabel = "今日往来";
      lastCity = todayAnchor.locationLabel;
      lastCheckedInAt = todayAnchor.checkedInAt;
    } else if (yesterdayAnchor) {
      lng = yesterdayAnchor.lng;
      lat = yesterdayAnchor.lat;
      positionSource = "yesterday";
      positionLabel = "昨日往来";
      lastCity = yesterdayAnchor.locationLabel;
      lastCheckedInAt = yesterdayAnchor.checkedInAt;
      for (const p of planPoints) {
        planLinks.push({
          planId: p.planId,
          planTitle: p.planTitle,
          fromLng: lng,
          fromLat: lat,
          toLng: p.lng,
          toLat: p.lat,
          customerName: p.customerName,
        });
      }
    } else if (planPoints[0]) {
      lng = planPoints[0].lng;
      lat = planPoints[0].lat;
      positionSource = "plan";
      positionLabel = "今日计划";
      lastCity = null;
      lastCheckedInAt = null;
    } else if (bucket.stops.length > 0) {
      const last = bucket.stops[bucket.stops.length - 1];
      lng = last.lng;
      lat = last.lat;
      positionSource = "yesterday";
      positionLabel = "近期打卡";
      lastCity = last.locationLabel;
      lastCheckedInAt = last.checkedInAt;
    } else {
      continue;
    }

    people.push({
      id: userId,
      name: bucket.name,
      lng,
      lat,
      positionSource,
      positionLabel,
      lastCheckedInAt,
      lastCity,
      stopCount: bucket.stops.length,
      stops: bucket.stops,
      dayCards: buildSalesDayCards(bucket.stops, input.todayYmd),
      planLinks,
    });
  }

  people.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return people;
}

export async function getMapDashboardBundle(): Promise<MapDashboardBundle> {
  const todayYmd = shanghaiYmd();
  const yesterdayYmd = shiftYmd(todayYmd, -1);
  const todayRange = shanghaiDayRange(todayYmd);
  const trackSince = startOfSalesTrackWindow();

  const [
    stageOptions,
    kindOptions,
    typeOptions,
    channelBundle,
    contracts,
    opportunities,
    checkIns,
    todayPlans,
  ] = await Promise.all([
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_KIND),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
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
      prisma.salesCheckIn.findMany({
        where: {
          checkedInAt: { gte: trackSince },
          latitude: { not: null },
          longitude: { not: null },
          user: { role: "SALES" },
        },
        select: {
          id: true,
          checkedInAt: true,
          latitude: true,
          longitude: true,
          addressProvince: true,
          addressCity: true,
          addressDistrict: true,
          notes: true,
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, customerType: true } },
          followUp: { select: { id: true, content: true } },
          salesDailyLog: { select: { id: true, dailyReport: true } },
        },
        orderBy: { checkedInAt: "asc" },
      }),
      prisma.salesWeeklyAssignment.findMany({
        where: {
          status: { in: ["PENDING", "PENDING_CONFIRM"] },
          dueAt: { gte: todayRange.start, lt: todayRange.end },
          assignee: { role: "SALES" },
          OR: [{ customerId: { not: null } }, { opportunityId: { not: null } }],
        },
        select: {
          id: true,
          title: true,
          assigneeId: true,
          assignee: { select: { id: true, name: true } },
          customer: {
            select: {
              id: true,
              name: true,
              province: true,
              city: true,
              district: true,
            },
          },
          opportunity: {
            select: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  province: true,
                  city: true,
                  district: true,
                },
              },
            },
          },
        },
      }),
    ]);

  const salesPeople = buildSalesPeople({
    checkIns,
    todayPlans: todayPlans.map((p) => ({
      id: p.id,
      title: p.title,
      assigneeId: p.assigneeId,
      assigneeName: p.assignee.name,
      customer: p.customer ?? p.opportunity?.customer ?? null,
    })),
    todayYmd,
    yesterdayYmd,
    typeOptions,
  });
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
    salesPeople,
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
      sales: salesPeople.length,
      unlocated,
    },
    salesTrackWindowLabel: "本周",
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
