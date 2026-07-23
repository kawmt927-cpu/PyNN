import { canEditCustomerContent, canManageCustomerOwner } from "@/lib/customers/access";
import { dedupeCustomersByName } from "@/lib/customers/duplicate-name";
import { buildCustomerListWhere, type CustomerListFilters } from "@/lib/customers/list-filters";
import { buildBroadNameWhere, rankByNameMatch, scoreNameMatch } from "@/lib/search/fuzzy-text";
import { opportunityListWhere } from "@/lib/opportunities/access";
import { prisma } from "@/lib/prisma";
import { CustomerCategory, OpportunityStatus, Prisma, UserRole } from "@prisma/client";

type CustomerSearchRow = {
  id: string;
  name: string;
  category: CustomerCategory;
  customerGrade: string | null;
  ownerId: string | null;
  owner: { name: string } | null;
  assistantOwners: { userId: string }[];
};

export type CustomerSearchResult = {
  id: string;
  name: string;
  category: CustomerCategory;
  customerGrade: string | null;
  writable: boolean;
  ownerName: string | null;
};

const customerSearchSelect = {
  id: true,
  name: true,
  category: true,
  customerGrade: true,
  ownerId: true,
  owner: { select: { name: true } },
  assistantOwners: { select: { userId: true } },
} as const;

function toCustomerSearchResult(
  role: UserRole,
  userId: string,
  row: CustomerSearchRow
): CustomerSearchResult {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    customerGrade: row.customerGrade,
    writable: canEditCustomerContent(role, userId, row),
    ownerName: row.owner?.name ?? null,
  };
}

function sortCustomersForSearch(role: UserRole, userId: string, rows: CustomerSearchRow[]) {
  return [...rows].sort((a, b) => {
    const aWritable = canEditCustomerContent(role, userId, a);
    const bWritable = canEditCustomerContent(role, userId, b);
    if (aWritable !== bWritable) return aWritable ? -1 : 1;
    return 0;
  });
}

export async function searchCustomersForUser(
  role: UserRole,
  userId: string,
  q: string,
  options?: {
    excludeId?: string;
    excludeIds?: string[];
    view?: "mine" | "all" | "pool";
    /** 搜索全部匹配客户，并标记是否可录入（不可录入的仍返回） */
    markWritable?: boolean;
  }
): Promise<CustomerSearchResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const filters: CustomerListFilters = {
    q: trimmed,
    category: "",
    customerType: "",
    customerGrade: "",
    hospitalLevel: "",
    ownerId: "",
    tags: [],
    province: "",
    city: "",
    district: "",
  };

  let where: Prisma.CustomerWhereInput;
  if (options?.markWritable) {
    where = { ...(buildBroadNameWhere("name", trimmed) as Prisma.CustomerWhereInput) };
  } else {
    const view = options?.view ?? (canManageCustomerOwner(role) ? "all" : "mine");
    where = buildCustomerListWhere(role, userId, view, filters);
  }

  const excluded = [
    ...(options?.excludeId ? [options.excludeId] : []),
    ...(options?.excludeIds ?? []),
  ];
  if (excluded.length > 0) {
    where.id = { notIn: [...new Set(excluded)] };
  }

  const rows = await prisma.customer.findMany({
    where,
    select: customerSearchSelect,
    take: 60,
    orderBy: { updatedAt: "desc" },
  });

  const ranked = rankByNameMatch(trimmed, rows);
  const ordered = options?.markWritable ? sortCustomersForSearch(role, userId, ranked) : ranked;

  return dedupeCustomersByName(ordered)
    .slice(0, 20)
    .map((row) => toCustomerSearchResult(role, userId, row));
}

export async function searchOpportunitiesForUser(
  role: UserRole,
  userId: string,
  q: string,
  options?: { status?: OpportunityStatus | "ALL"; customerId?: string }
) {
  const trimmed = q.trim();
  if (!trimmed && !options?.customerId) return [];

  const base = opportunityListWhere(role, userId);
  const status = options?.status ?? "ALL";

  const where: Prisma.OpportunityWhereInput = {
    ...base,
    ...(status !== "ALL" ? { status } : {}),
    ...(options?.customerId ? { customerId: options.customerId } : {}),
    ...(trimmed
      ? {
          OR: [
            buildBroadNameWhere("title", trimmed) as Prisma.OpportunityWhereInput,
            {
              customer: buildBroadNameWhere("name", trimmed) as Prisma.CustomerWhereInput,
            },
          ],
        }
      : {}),
  };

  const rows = await prisma.opportunity.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      customer: { select: { name: true } },
    },
    take: 60,
    orderBy: { updatedAt: "desc" },
  });

  if (!trimmed) {
    return rows.slice(0, 20);
  }

  return rows
    .map((row) => ({
      row,
      score: Math.max(
        scoreNameMatch(trimmed, row.title),
        row.customer ? scoreNameMatch(trimmed, row.customer.name) : 0
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.row.updatedAt.getTime() - a.row.updatedAt.getTime())
    .map((item) => item.row)
    .slice(0, 20);
}
