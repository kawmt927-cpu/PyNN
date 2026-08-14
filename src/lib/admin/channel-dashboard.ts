import { prisma } from "@/lib/prisma";
import { CONFIG_CATEGORY, getConfigOptions } from "@/lib/config-options";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";
import {
  CHANNEL_KIND,
  CHANNEL_KIND_COVERAGE_KEYS,
  type ChannelCoverageKind,
  type ChannelCoverageTargets,
  getChannelCoverageTargets,
  ensureChannelCoverageConfig,
  targetForCoverageKind,
} from "@/lib/customers/channel-kind";
import { CUSTOMER_GRADE } from "@/lib/customers/grade";

export const CHANNEL_ACTIVE_DAYS = 30;
export const UNASSIGNED_PROVINCE = "未填省份";
export const UNCLASSIFIED_KIND = "UNCLASSIFIED";

/** ECharts 中国地图常用省名 */
const PROVINCE_ALIASES: Record<string, string> = {
  北京: "北京",
  北京市: "北京",
  天津: "天津",
  天津市: "天津",
  上海: "上海",
  上海市: "上海",
  重庆: "重庆",
  重庆市: "重庆",
  河北: "河北",
  河北省: "河北",
  山西: "山西",
  山西省: "山西",
  辽宁: "辽宁",
  辽宁省: "辽宁",
  吉林: "吉林",
  吉林省: "吉林",
  黑龙江: "黑龙江",
  黑龙江省: "黑龙江",
  江苏: "江苏",
  江苏省: "江苏",
  浙江: "浙江",
  浙江省: "浙江",
  安徽: "安徽",
  安徽省: "安徽",
  福建: "福建",
  福建省: "福建",
  江西: "江西",
  江西省: "江西",
  山东: "山东",
  山东省: "山东",
  河南: "河南",
  河南省: "河南",
  湖北: "湖北",
  湖北省: "湖北",
  湖南: "湖南",
  湖南省: "湖南",
  广东: "广东",
  广东省: "广东",
  海南: "海南",
  海南省: "海南",
  四川: "四川",
  四川省: "四川",
  贵州: "贵州",
  贵州省: "贵州",
  云南: "云南",
  云南省: "云南",
  陕西: "陕西",
  陕西省: "陕西",
  甘肃: "甘肃",
  甘肃省: "甘肃",
  青海: "青海",
  青海省: "青海",
  台湾: "台湾",
  台湾省: "台湾",
  内蒙古: "内蒙古",
  内蒙古自治区: "内蒙古",
  广西: "广西",
  广西壮族自治区: "广西",
  西藏: "西藏",
  西藏自治区: "西藏",
  宁夏: "宁夏",
  宁夏回族自治区: "宁夏",
  新疆: "新疆",
  新疆维吾尔自治区: "新疆",
  香港: "香港",
  香港特别行政区: "香港",
  澳门: "澳门",
  澳门特别行政区: "澳门",
};

export function normalizeProvinceName(raw: string | null | undefined): string {
  const text = raw?.trim();
  if (!text) return UNASSIGNED_PROVINCE;
  if (PROVINCE_ALIASES[text]) return PROVINCE_ALIASES[text];
  const stripped = text
    .replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/u, "")
    .trim();
  return (
    PROVINCE_ALIASES[stripped] ??
    PROVINCE_ALIASES[text] ??
    (stripped || UNASSIGNED_PROVINCE)
  );
}

export type ChannelKindCounts = Record<string, number>;

export type ProvinceChannelRow = {
  province: string;
  total: number;
  byKind: ChannelKindCounts;
  otherCount: number;
  unclassifiedCount: number;
  coverage: Record<
    ChannelCoverageKind,
    { actual: number; target: number; gap: number; met: boolean }
  >;
  metKinds: number;
  coverageScore: number;
  isCovered: boolean;
  activeCount: number;
  inactiveCount: number;
  byGrade: Record<string, number>;
};

export type ChannelDashboardBundle = {
  targets: ChannelCoverageTargets;
  kindLabels: Record<string, string>;
  gradeLabels: Record<string, string>;
  byProvince: ProvinceChannelRow[];
  totals: {
    customers: number;
    provinces: number;
    coveredProvinces: number;
    gapProvinces: number;
    unclassified: number;
    unassignedProvince: number;
    active: number;
    inactive: number;
  };
  activeWindowDays: number;
};

function emptyCoverage(targets: ChannelCoverageTargets) {
  return Object.fromEntries(
    CHANNEL_KIND_COVERAGE_KEYS.map((kind) => {
      const target = targetForCoverageKind(targets, kind);
      return [kind, { actual: 0, target, gap: target, met: target <= 0 }];
    })
  ) as ProvinceChannelRow["coverage"];
}

export async function getChannelDashboardBundle(
  now = new Date()
): Promise<ChannelDashboardBundle> {
  await ensureChannelCoverageConfig();
  const [targets, typeOptions, kindOptions, channelGradeOptions, customers] =
    await Promise.all([
      getChannelCoverageTargets(),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_KIND),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE),
      prisma.customer.findMany({
        select: {
          id: true,
          name: true,
          province: true,
          customerType: true,
          customerGrade: true,
          channelKind: true,
          owner: { select: { name: true } },
          coverageProvinces: { select: { province: true } },
          followUps: {
            orderBy: { followUpAt: "desc" },
            take: 1,
            select: { followUpAt: true },
          },
        },
      }),
    ]);

  const kindLabels = Object.fromEntries(kindOptions.map((o) => [o.value, o.label]));
  kindLabels[UNCLASSIFIED_KIND] = "未分类";
  const gradeLabels = Object.fromEntries(
    channelGradeOptions.map((o) => [o.value, o.label])
  );

  const activeSince = new Date(now);
  activeSince.setDate(activeSince.getDate() - CHANNEL_ACTIVE_DAYS);

  const channelCustomers = customers.filter((c) =>
    isChannelCustomerType(c.customerType, typeOptions)
  );

  const byProvinceMap = new Map<string, ProvinceChannelRow>();

  const ensureProvince = (province: string) => {
    let row = byProvinceMap.get(province);
    if (!row) {
      row = {
        province,
        total: 0,
        byKind: {},
        otherCount: 0,
        unclassifiedCount: 0,
        coverage: emptyCoverage(targets),
        metKinds: 0,
        coverageScore: 0,
        isCovered: false,
        activeCount: 0,
        inactiveCount: 0,
        byGrade: {},
      };
      byProvinceMap.set(province, row);
    }
    return row;
  };

  let unclassified = 0;
  let unassignedProvince = 0;
  let active = 0;
  let inactive = 0;

  for (const c of channelCustomers) {
    const kind = c.channelKind?.trim() || UNCLASSIFIED_KIND;
    if (kind === UNCLASSIFIED_KIND) unclassified += 1;

    const lastAt = c.followUps[0]?.followUpAt;
    const isActive = Boolean(lastAt && lastAt >= activeSince);
    if (isActive) active += 1;
    else inactive += 1;

    const covered = c.coverageProvinces
      .map((r) => normalizeProvinceName(r.province))
      .filter((p) => p !== UNASSIGNED_PROVINCE);
    const provinces =
      covered.length > 0
        ? [...new Set(covered)]
        : [normalizeProvinceName(c.province)];

    if (provinces.length === 1 && provinces[0] === UNASSIGNED_PROVINCE) {
      unassignedProvince += 1;
    }

    const grade = c.customerGrade?.trim() || CUSTOMER_GRADE.NONE;

    for (const province of provinces) {
      const row = ensureProvince(province);
      row.total += 1;
      row.byKind[kind] = (row.byKind[kind] ?? 0) + 1;
      if (kind === UNCLASSIFIED_KIND) row.unclassifiedCount += 1;
      else if (kind === CHANNEL_KIND.OTHER) row.otherCount += 1;
      row.byGrade[grade] = (row.byGrade[grade] ?? 0) + 1;
      if (isActive) row.activeCount += 1;
      else row.inactiveCount += 1;
    }
  }

  for (const row of byProvinceMap.values()) {
    for (const kind of CHANNEL_KIND_COVERAGE_KEYS) {
      const actual = row.byKind[kind] ?? 0;
      const target = targetForCoverageKind(targets, kind);
      const gap = Math.max(0, target - actual);
      row.coverage[kind] = {
        actual,
        target,
        gap,
        met: actual >= target,
      };
    }
    row.metKinds = CHANNEL_KIND_COVERAGE_KEYS.filter((k) => row.coverage[k].met).length;
    row.coverageScore = row.metKinds / CHANNEL_KIND_COVERAGE_KEYS.length;
    row.isCovered = row.metKinds === CHANNEL_KIND_COVERAGE_KEYS.length;
  }

  const byProvince = [...byProvinceMap.values()].sort((a, b) => {
    if (a.isCovered !== b.isCovered) return a.isCovered ? 1 : -1;
    if (a.coverageScore !== b.coverageScore) return a.coverageScore - b.coverageScore;
    return b.total - a.total || a.province.localeCompare(b.province, "zh-CN");
  });

  const coveredProvinces = byProvince.filter((p) => p.isCovered).length;

  return {
    targets,
    kindLabels,
    gradeLabels,
    byProvince,
    totals: {
      customers: channelCustomers.length,
      provinces: byProvince.length,
      coveredProvinces,
      gapProvinces: byProvince.length - coveredProvinces,
      unclassified,
      unassignedProvince,
      active,
      inactive,
    },
    activeWindowDays: CHANNEL_ACTIVE_DAYS,
  };
}
