import { CustomerCategory, Prisma, UserRole } from "@prisma/client";
import { customerListWhere, type CustomerListView } from "@/lib/customers/access";
import { buildBroadNameWhere } from "@/lib/search/fuzzy-text";

export type CustomerListFilters = {
  q: string;
  category: string;
  customerType: string;
  customerGrade: string;
  source: string;
  ownerId: string;
};

export function parseCustomerListFilters(
  params: Record<string, string | undefined>
): CustomerListFilters {
  return {
    q: params.q?.trim() ?? "",
    category: params.category ?? "",
    customerType: params.type ?? "",
    customerGrade: params.grade ?? "",
    source: params.source ?? "",
    ownerId: params.ownerId ?? "",
  };
}

export function hasActiveCustomerListFilters(filters: CustomerListFilters) {
  return Boolean(
    filters.q ||
      filters.category ||
      filters.customerType ||
      filters.customerGrade ||
      filters.source ||
      filters.ownerId
  );
}

export function buildCustomerListHref(view: CustomerListView, filters: CustomerListFilters) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.customerType) params.set("type", filters.customerType);
  if (filters.customerGrade) params.set("grade", filters.customerGrade);
  if (filters.source) params.set("source", filters.source);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  return `/customers?${params.toString()}`;
}

export function buildCustomerListWhere(
  role: UserRole,
  userId: string,
  view: CustomerListView,
  filters: CustomerListFilters
): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {
    ...customerListWhere(role, userId, view),
  };

  if (filters.q) {
    Object.assign(where, buildBroadNameWhere("name", filters.q));
  }
  if (filters.category) {
    where.category = filters.category as CustomerCategory;
  }
  if (filters.customerType) {
    where.customerType = filters.customerType;
  }
  if (filters.customerGrade) {
    where.customerGrade = filters.customerGrade;
  }
  if (filters.source) {
    where.source = filters.source;
  }
  if (filters.ownerId && view === "all") {
    where.ownerId = filters.ownerId === "pool" ? null : filters.ownerId;
  }

  return where;
}
