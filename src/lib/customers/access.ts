import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CustomerListView = "mine" | "pool" | "all";

export function canManageCustomerOwner(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function resolveCustomerListView(
  rawView: string | undefined,
  role: UserRole
): CustomerListView {
  const isManager = canManageCustomerOwner(role);
  if (rawView === "pool") return "pool";
  if (rawView === "mine") return "mine";
  if (rawView === "all" && isManager) return "all";
  return isManager ? "all" : "mine";
}

export function customerListTabs(role: UserRole) {
  if (canManageCustomerOwner(role)) {
    return [
      { key: "all" as const, label: "全部客户", href: "/customers?view=all" },
      { key: "mine" as const, label: "我的客户", href: "/customers?view=mine" },
      { key: "pool" as const, label: "公海池", href: "/customers?view=pool" },
    ];
  }
  return [
    { key: "mine" as const, label: "我的客户", href: "/customers?view=mine" },
    { key: "pool" as const, label: "公海池", href: "/customers?view=pool" },
  ];
}

export function customerListWhere(
  role: UserRole,
  userId: string,
  view: CustomerListView = "mine"
) {
  if (view === "pool") return { ownerId: null };
  if (role === "SALES" || view === "mine") return { ownerId: userId };
  return {};
}

export async function getCustomerForUser(id: string, role: UserRole, userId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] },
      relationsFrom: {
        include: {
          relatedCustomer: {
            select: { id: true, name: true, category: true, customerType: true },
          },
        },
      },
      relationsTo: {
        include: {
          customer: {
            select: { id: true, name: true, category: true, customerType: true },
          },
        },
      },
      tags: { select: { tagValue: true } },
    },
  });

  if (!customer) return null;
  if (role === "SALES" && customer.ownerId !== userId && customer.ownerId !== null) {
    return null;
  }
  return customer;
}
