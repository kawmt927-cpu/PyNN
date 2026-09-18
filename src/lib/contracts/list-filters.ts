import type { ContractStatus, Prisma } from "@prisma/client";
import { CONTRACT_LIST_STATUS_LABELS } from "@/lib/permissions";
import { excludeRejectedFromContractList } from "@/lib/contracts/access";
import type {
  CollectFilterValue,
  SettlementFilterValue,
} from "@/lib/contracts/contract-collectible";
import type { PaymentDueFilterValue } from "@/lib/contracts/payment-due";

export type ContractListFilters = {
  q?: string;
  status?: ContractStatus;
  ownerId?: string;
  /** 默认 open；URL 可省略 */
  settlement: SettlementFilterValue;
  collect?: CollectFilterValue;
  dueWithin?: PaymentDueFilterValue;
};

const CONTRACT_LIST_STATUSES = Object.keys(CONTRACT_LIST_STATUS_LABELS) as ContractStatus[];

const COLLECT_VALUES: CollectFilterValue[] = [
  "ready",
  "difficult",
  "bad_debt",
  "partial",
  "pending",
];

const DUE_WITHIN_VALUES: PaymentDueFilterValue[] = ["30", "90", "180", "overdue"];

export const SETTLEMENT_FILTER_OPTIONS: Array<{
  value: SettlementFilterValue;
  label: string;
}> = [
  { value: "open", label: "未完成" },
  { value: "all", label: "全部" },
  /** 非坏账待回≈0；含坏账分期的合同也可能显示为已结清 */
  { value: "settled", label: "已结清（不含坏账）" },
];

export const COLLECT_FILTER_OPTIONS: Array<{
  value: CollectFilterValue;
  label: string;
}> = [
  { value: "ready", label: "可催款" },
  { value: "difficult", label: "回款困难" },
  { value: "bad_debt", label: "含坏账" },
  { value: "partial", label: "部分已回" },
  { value: "pending", label: "未开始催收" },
];

export const DUE_WITHIN_FILTER_OPTIONS: Array<{
  value: PaymentDueFilterValue;
  label: string;
}> = [
  { value: "30", label: "1 个月内" },
  { value: "90", label: "3 个月内" },
  { value: "180", label: "6 个月内" },
  { value: "overdue", label: "已逾期" },
];

export function parseContractListFilters(
  params: Record<string, string | string[] | undefined>
): ContractListFilters {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusRaw = typeof params.status === "string" ? params.status : "";
  const status = CONTRACT_LIST_STATUSES.includes(statusRaw as ContractStatus)
    ? (statusRaw as ContractStatus)
    : undefined;
  const ownerId = typeof params.ownerId === "string" ? params.ownerId.trim() : "";

  const settlementRaw = typeof params.settlement === "string" ? params.settlement : "";
  const settlement: SettlementFilterValue =
    settlementRaw === "all" || settlementRaw === "settled" || settlementRaw === "open"
      ? settlementRaw
      : "open";

  const collectRaw = typeof params.collect === "string" ? params.collect : "";
  // 已结清时忽略催收态势
  const collect =
    settlement !== "settled" &&
    COLLECT_VALUES.includes(collectRaw as CollectFilterValue)
      ? (collectRaw as CollectFilterValue)
      : undefined;

  const dueRaw = typeof params.dueWithin === "string" ? params.dueWithin : "";
  const dueWithinNormalized =
    dueRaw === "15" ? "30" : dueRaw === "90" || dueRaw === "30" || dueRaw === "180" || dueRaw === "overdue"
      ? dueRaw
      : "";
  const dueWithin = DUE_WITHIN_VALUES.includes(dueWithinNormalized as PaymentDueFilterValue)
    ? (dueWithinNormalized as PaymentDueFilterValue)
    : undefined;

  return {
    q: q || undefined,
    status,
    ownerId: ownerId || undefined,
    settlement,
    collect,
    dueWithin,
  };
}

export function buildContractListFilterWhere(
  filters: ContractListFilters
): Prisma.ContractWhereInput {
  const where: Prisma.ContractWhereInput = {
    ...excludeRejectedFromContractList(),
  };

  if (filters.status) where.status = filters.status;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { contractNo: { contains: filters.q } },
      { signCustomer: { name: { contains: filters.q } } },
      { endUserCustomer: { name: { contains: filters.q } } },
    ];
  }

  return where;
}

export function buildContractListHref(filters: ContractListFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  // 默认 open 不写进 URL；非默认才写
  if (filters.settlement !== "open") params.set("settlement", filters.settlement);
  if (filters.collect) params.set("collect", filters.collect);
  if (filters.dueWithin) params.set("dueWithin", filters.dueWithin);
  const qs = params.toString();
  return qs ? `/contracts?${qs}` : "/contracts";
}

/** 除默认「未完成」以外的筛选是否激活（用于文案） */
export function hasActiveContractListFilters(filters: ContractListFilters) {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.ownerId ||
      filters.settlement !== "open" ||
      filters.collect ||
      filters.dueWithin
  );
}
