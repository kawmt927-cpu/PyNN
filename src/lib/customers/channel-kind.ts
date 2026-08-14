import { prisma } from "@/lib/prisma";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";

export const CHANNEL_KIND_CATEGORY = "channel_kind" as const;

/** 渠道细分类型（覆盖考核不含 OTHER） */
export const CHANNEL_KIND = {
  INTEGRATOR: "INTEGRATOR",
  HRP_VENDOR: "HRP_VENDOR",
  COMPETITOR: "COMPETITOR",
  OTHER: "OTHER",
} as const;

export type ChannelKindValue = (typeof CHANNEL_KIND)[keyof typeof CHANNEL_KIND];

export const CHANNEL_KIND_COVERAGE_KEYS = [
  CHANNEL_KIND.INTEGRATOR,
  CHANNEL_KIND.HRP_VENDOR,
  CHANNEL_KIND.COMPETITOR,
] as const;

export type ChannelCoverageKind = (typeof CHANNEL_KIND_COVERAGE_KEYS)[number];

export const DEFAULT_CHANNEL_KIND_OPTIONS = [
  { category: CHANNEL_KIND_CATEGORY, value: CHANNEL_KIND.INTEGRATOR, label: "信息化集成商", sortOrder: 1 },
  { category: CHANNEL_KIND_CATEGORY, value: CHANNEL_KIND.HRP_VENDOR, label: "HRP 厂商", sortOrder: 2 },
  { category: CHANNEL_KIND_CATEGORY, value: CHANNEL_KIND.COMPETITOR, label: "友商", sortOrder: 3 },
  { category: CHANNEL_KIND_CATEGORY, value: CHANNEL_KIND.OTHER, label: "其他", sortOrder: 4 },
] as const;

export const DEFAULT_CHANNEL_COVERAGE_TARGETS = {
  integratorTarget: 3,
  hrpVendorTarget: 3,
  competitorTarget: 2,
} as const;

export type ChannelCoverageTargets = {
  integratorTarget: number;
  hrpVendorTarget: number;
  competitorTarget: number;
};

export function targetForCoverageKind(
  targets: ChannelCoverageTargets,
  kind: ChannelCoverageKind
): number {
  switch (kind) {
    case CHANNEL_KIND.INTEGRATOR:
      return targets.integratorTarget;
    case CHANNEL_KIND.HRP_VENDOR:
      return targets.hrpVendorTarget;
    case CHANNEL_KIND.COMPETITOR:
      return targets.competitorTarget;
  }
}

export function isCoverageChannelKind(value: string | null | undefined): value is ChannelCoverageKind {
  return (
    value === CHANNEL_KIND.INTEGRATOR ||
    value === CHANNEL_KIND.HRP_VENDOR ||
    value === CHANNEL_KIND.COMPETITOR
  );
}

export async function getChannelCoverageTargets(): Promise<ChannelCoverageTargets> {
  const row = await prisma.channelCoverageConfig.findUnique({
    where: { id: "default" },
    select: {
      integratorTarget: true,
      hrpVendorTarget: true,
      competitorTarget: true,
    },
  });
  return {
    integratorTarget: row?.integratorTarget ?? DEFAULT_CHANNEL_COVERAGE_TARGETS.integratorTarget,
    hrpVendorTarget: row?.hrpVendorTarget ?? DEFAULT_CHANNEL_COVERAGE_TARGETS.hrpVendorTarget,
    competitorTarget: row?.competitorTarget ?? DEFAULT_CHANNEL_COVERAGE_TARGETS.competitorTarget,
  };
}

export async function ensureChannelCoverageConfig() {
  await prisma.channelCoverageConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...DEFAULT_CHANNEL_COVERAGE_TARGETS },
    update: {},
  });
}

/**
 * 渠道客户必须有启用的 channelKind；非渠道清空为 null。
 */
export async function resolveChannelKindForCustomer(input: {
  customerType: string | null | undefined;
  channelKind?: string | null;
  typeOptions?: { value: string; label: string }[] | null;
}): Promise<string | null> {
  const { CONFIG_CATEGORY, resolveConfigValue, getConfigOptions } = await import(
    "@/lib/config-options"
  );
  const typeOptions =
    input.typeOptions ?? (await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE));
  const isChannel = isChannelCustomerType(input.customerType, typeOptions);
  if (!isChannel) return null;

  const raw = input.channelKind?.trim();
  if (!raw) {
    throw new Error("请选择渠道类型（信息化集成商 / HRP 厂商 / 友商 / 其他）");
  }
  const resolved = await resolveConfigValue(CHANNEL_KIND_CATEGORY, raw);
  if (!resolved) {
    throw new Error("请选择渠道类型（信息化集成商 / HRP 厂商 / 友商 / 其他）");
  }
  return resolved;
}
