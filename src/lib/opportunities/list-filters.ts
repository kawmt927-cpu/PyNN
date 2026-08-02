import type { OpportunityStatus, Prisma, UserRole } from "@prisma/client";
import {
  canManageOpportunityOwner,
  opportunityListWhere,
  type OpportunityListView,
  resolveOpportunityListView,
} from "@/lib/opportunities/access";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/opportunities/status";

export type OpportunityListFilters = {
  statuses: OpportunityStatus[];
  stages: string[];
  ownerIds: string[];
  grades: string[];
};

export const OPPORTUNITY_LIST_SORT_COLUMNS = [
  "grade",
  "amount",
  "stage",
  "lastVisit",
  "nextVisit",
] as const;

export type OpportunityListSortColumn = (typeof OPPORTUNITY_LIST_SORT_COLUMNS)[number];

export type OpportunityListSort = {
  column: OpportunityListSortColumn | "";
  dir: "asc" | "desc";
};

export const DEFAULT_OPPORTUNITY_LIST_STATUSES: OpportunityStatus[] = ["NOT_SIGNED"];

export const EMPTY_OPPORTUNITY_LIST_FILTERS: OpportunityListFilters = {
  statuses: [...DEFAULT_OPPORTUNITY_LIST_STATUSES],
  stages: [],
  ownerIds: [],
  grades: [],
};

export const OPPORTUNITY_STATUS_FILTER_OPTIONS: Array<{
  value: OpportunityStatus;
  label: string;
}> = (
  Object.entries(OPPORTUNITY_STATUS_LABELS) as Array<[OpportunityStatus, string]>
).map(([value, label]) => ({ value, label }));

function parseCsvParam(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function isOpportunityStatus(value: string): value is OpportunityStatus {
  return value === "NOT_SIGNED" || value === "SIGNED" || value === "ABANDONED";
}

function statusesFromLegacyView(view: OpportunityListView): OpportunityStatus[] {
  if (view === "all") return [];
  if (view === "signed") return ["SIGNED"];
  if (view === "abandoned") return ["ABANDONED"];
  return ["NOT_SIGNED"];
}

function sameStatuses(a: OpportunityStatus[], b: OpportunityStatus[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

export function parseOpportunityListFilters(
  params: Record<string, string | undefined>
): OpportunityListFilters {
  let statuses: OpportunityStatus[];

  if (params.status != null) {
    if (!params.status.trim() || params.status.trim() === "all") {
      statuses = [];
    } else {
      statuses = parseCsvParam(params.status).filter(isOpportunityStatus);
    }
  } else if (params.view) {
    statuses = statusesFromLegacyView(resolveOpportunityListView(params.view));
  } else {
    statuses = [...DEFAULT_OPPORTUNITY_LIST_STATUSES];
  }

  return {
    statuses,
    stages: parseCsvParam(params.stage),
    ownerIds: parseCsvParam(params.ownerId),
    grades: parseCsvParam(params.grade),
  };
}

export function parseOpportunityListSort(
  params: Record<string, string | undefined>
): OpportunityListSort {
  const column = OPPORTUNITY_LIST_SORT_COLUMNS.includes(
    params.sort as OpportunityListSortColumn
  )
    ? (params.sort as OpportunityListSortColumn)
    : "";
  const dir = params.dir === "desc" ? "desc" : "asc";
  return { column, dir };
}

export function hasActiveOpportunityListFilters(filters: OpportunityListFilters) {
  return Boolean(
    filters.stages.length ||
      filters.ownerIds.length ||
      filters.grades.length ||
      !sameStatuses(filters.statuses, DEFAULT_OPPORTUNITY_LIST_STATUSES)
  );
}

export function buildOpportunityListHref(
  filters: OpportunityListFilters = EMPTY_OPPORTUNITY_LIST_FILTERS,
  sort: OpportunityListSort = { column: "", dir: "asc" }
) {
  const params = new URLSearchParams();
  if (filters.statuses.length === 0) {
    params.set("status", "all");
  } else if (!sameStatuses(filters.statuses, DEFAULT_OPPORTUNITY_LIST_STATUSES)) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.stages.length) params.set("stage", filters.stages.join(","));
  if (filters.ownerIds.length) params.set("ownerId", filters.ownerIds.join(","));
  if (filters.grades.length) params.set("grade", filters.grades.join(","));
  if (sort.column) {
    params.set("sort", sort.column);
    params.set("dir", sort.dir);
  }
  const query = params.toString();
  return query ? `/opportunities?${query}` : "/opportunities";
}

/** 点击列头：同列切换升降序，换列默认升序 */
export function nextOpportunityListSort(
  current: OpportunityListSort,
  column: OpportunityListSortColumn
): OpportunityListSort {
  if (current.column === column) {
    return { column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { column, dir: "asc" };
}

export function opportunityListTitle(filters: OpportunityListFilters) {
  if (filters.statuses.length === 0) return "全部商机";
  if (filters.statuses.length === 1) {
    return OPPORTUNITY_STATUS_LABELS[filters.statuses[0]] + "商机";
  }
  return "商机列表";
}

export function buildOpportunityListWhere(
  role: UserRole,
  userId: string,
  filters: OpportunityListFilters
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {
    ...opportunityListWhere(role, userId),
  };

  if (filters.statuses.length === 1) {
    where.status = filters.statuses[0];
  } else if (filters.statuses.length > 1) {
    where.status = { in: filters.statuses };
  }

  if (filters.stages.length === 1) {
    where.stage = filters.stages[0];
  } else if (filters.stages.length > 1) {
    where.stage = { in: filters.stages };
  }

  if (filters.grades.length === 1) {
    where.grade = filters.grades[0];
  } else if (filters.grades.length > 1) {
    where.grade = { in: filters.grades };
  }

  if (filters.ownerIds.length > 0 && canManageOpportunityOwner(role)) {
    where.ownerId =
      filters.ownerIds.length === 1 ? filters.ownerIds[0] : { in: filters.ownerIds };
  }

  return where;
}
