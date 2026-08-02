import type { ContractStatus, Prisma } from "@prisma/client";
import { CONTRACT_LIST_STATUS_LABELS } from "@/lib/permissions";
import { excludeRejectedFromContractList } from "@/lib/contracts/access";

export type ContractListFilters = {
  q?: string;
  status?: ContractStatus;
  ownerId?: string;
};

const CONTRACT_LIST_STATUSES = Object.keys(CONTRACT_LIST_STATUS_LABELS) as ContractStatus[];

export function parseContractListFilters(
  params: Record<string, string | string[] | undefined>
): ContractListFilters {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusRaw = typeof params.status === "string" ? params.status : "";
  const status = CONTRACT_LIST_STATUSES.includes(statusRaw as ContractStatus)
    ? (statusRaw as ContractStatus)
    : undefined;
  const ownerId = typeof params.ownerId === "string" ? params.ownerId.trim() : "";

  return {
    q: q || undefined,
    status,
    ownerId: ownerId || undefined,
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
  const qs = params.toString();
  return qs ? `/contracts?${qs}` : "/contracts";
}

export function hasActiveContractListFilters(filters: ContractListFilters) {
  return Boolean(filters.q || filters.status || filters.ownerId);
}
