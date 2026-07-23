import { CustomerCategory, HospitalLevel, Prisma, UserRole } from "@prisma/client";
import { customerListWhere, type CustomerListView } from "@/lib/customers/access";
import { buildBroadNameWhere } from "@/lib/search/fuzzy-text";

export type CustomerListFilters = {
  q: string;
  category: string;
  customerType: string;
  customerGrade: string;
  hospitalLevel: string;
  ownerId: string;
  tags: string[];
  province: string;
  city: string;
  district: string;
};

export function parseCustomerListFilters(
  params: Record<string, string | undefined>
): CustomerListFilters {
  const tags = params.tags
    ? params.tags.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    q: params.q?.trim() ?? "",
    category: params.category ?? "",
    customerType: params.type ?? "",
    customerGrade: params.grade ?? "",
    hospitalLevel: params.hospitalLevel ?? "",
    ownerId: params.ownerId ?? "",
    tags: [...new Set(tags)],
    province: params.province?.trim() ?? "",
    city: params.city?.trim() ?? "",
    district: params.district?.trim() ?? "",
  };
}

export function normalizeCustomerListTagFilters(
  tags: string[],
  allowedValues: Set<string>
): string[] {
  return [...new Set(tags.filter((tag) => allowedValues.has(tag)))];
}

export function hasActiveCustomerListFilters(filters: CustomerListFilters) {
  return Boolean(
    filters.q ||
      filters.category ||
      filters.customerType ||
      filters.customerGrade ||
      filters.hospitalLevel ||
      filters.ownerId ||
      filters.province ||
      filters.city ||
      filters.district ||
      filters.tags.length > 0
  );
}

export function buildCustomerListHref(
  view: CustomerListView,
  filters: CustomerListFilters,
  page = 1
) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.customerType) params.set("type", filters.customerType);
  if (filters.customerGrade) params.set("grade", filters.customerGrade);
  if (filters.hospitalLevel) params.set("hospitalLevel", filters.hospitalLevel);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.province) params.set("province", filters.province);
  if (filters.city) params.set("city", filters.city);
  if (filters.district) params.set("district", filters.district);
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (page > 1) params.set("page", String(page));
  return `/customers?${params.toString()}`;
}

/** 电脑端客户列表每页条数 */
export const CUSTOMER_LIST_PAGE_SIZE = 50;

export function parseCustomerListPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

export function customerListPageCount(total: number, pageSize = CUSTOMER_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
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
  if (filters.hospitalLevel) {
    where.category = "HOSPITAL";
    where.hospitalLevel = filters.hospitalLevel as HospitalLevel;
  }
  if (filters.ownerId && view === "all") {
    where.ownerId = filters.ownerId === "pool" ? null : filters.ownerId;
  }
  if (filters.province) {
    where.province = filters.province;
  }
  if (filters.city) {
    where.city = filters.city;
  }
  if (filters.district) {
    where.district = filters.district;
  }
  if (filters.tags.length > 0) {
    where.tags = {
      some: { tagValue: { in: filters.tags } },
    };
  }

  return where;
}
