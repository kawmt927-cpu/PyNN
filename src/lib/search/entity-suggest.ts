import { canManageCustomerOwner } from "@/lib/customers/access";
import { buildCustomerListWhere, type CustomerListFilters } from "@/lib/customers/list-filters";
import { buildBroadNameWhere, rankByNameMatch, scoreNameMatch } from "@/lib/search/fuzzy-text";
import { opportunityListWhere } from "@/lib/opportunities/access";
import { prisma } from "@/lib/prisma";
import { OpportunityStatus, Prisma, UserRole } from "@prisma/client";

export async function searchCustomersForUser(
  role: UserRole,
  userId: string,
  q: string,
  options?: { excludeId?: string; excludeIds?: string[]; view?: "mine" | "all" | "pool" }
) {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const view = options?.view ?? (canManageCustomerOwner(role) ? "all" : "mine");

  const filters: CustomerListFilters = {
    q: trimmed,
    category: "",
    customerType: "",
    customerGrade: "",
    ownerId: "",
    tags: [],
  };

  const where = buildCustomerListWhere(role, userId, view, filters);

  const excluded = [
    ...(options?.excludeId ? [options.excludeId] : []),
    ...(options?.excludeIds ?? []),
  ];
  if (excluded.length > 0) {
    where.id = { notIn: [...new Set(excluded)] };
  }

  const rows = await prisma.customer.findMany({
    where,
    select: { id: true, name: true, category: true },
    take: 60,
  });

  return rankByNameMatch(trimmed, rows).slice(0, 20);
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
  });

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
