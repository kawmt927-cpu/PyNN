import { Prisma, UserRole } from "@prisma/client";
import { hasPendingWeeklyAssignmentForCustomer } from "@/lib/today-work/weekly-assignments";
import { prisma } from "@/lib/prisma";

export type CustomerAccessOptions = {
  /** 销售被指派该客户的待完成周任务时，允许查看跟进页（不可录入） */
  allowAssignedWeeklyTask?: boolean;
};

export type CustomerResponsibleShape = {
  id: string;
  ownerId: string | null;
  assistantOwners?: { userId: string }[];
};

export const customerDetailInclude = {
  owner: { select: { id: true, name: true } },
  assistantOwners: {
    select: {
      userId: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  contacts: { orderBy: [{ isPrimary: "desc" as const }, { updatedAt: "desc" as const }] },
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
};

export type CustomerListView = "mine" | "pool" | "all";

export function canManageCustomerOwner(role: UserRole) {
  return role === "SALES_MANAGER" || role === "ADMIN";
}

export function isCustomerResponsible(
  userId: string,
  customer: { ownerId: string | null; assistantOwners?: { userId: string }[] }
) {
  if (customer.ownerId === userId) return true;
  return customer.assistantOwners?.some((row) => row.userId === userId) ?? false;
}

export function canEditCustomerContent(
  role: UserRole,
  userId: string,
  customer: CustomerResponsibleShape
) {
  if (canManageCustomerOwner(role)) return true;
  return isCustomerResponsible(userId, customer);
}

export function canEditCustomerFollowUp(
  role: UserRole,
  userId: string,
  customer: CustomerResponsibleShape
) {
  return canEditCustomerContent(role, userId, customer);
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
  if (role === "SALES" || view === "mine") {
    return customerResponsibleWhere(userId);
  }
  return {};
}

/** 销售可录入往来/联系人/打卡的客户范围（负责人或协助负责人；管理角色不限） */
export function customerResponsibleWhere(userId: string) {
  return {
    OR: [
      { ownerId: userId },
      { assistantOwners: { some: { userId } } },
    ],
  } satisfies Prisma.CustomerWhereInput;
}

export function customerWritableWhere(role: UserRole, userId: string): Prisma.CustomerWhereInput {
  if (canManageCustomerOwner(role)) return {};
  return customerResponsibleWhere(userId);
}

export async function getCustomerForUser(
  id: string,
  role: UserRole,
  userId: string,
  options?: CustomerAccessOptions
) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: customerDetailInclude,
  });

  if (!customer) return null;
  if (canManageCustomerOwner(role)) return customer;

  if (role === "SALES") {
    if (customer.ownerId === null) return customer;
    if (isCustomerResponsible(userId, customer)) return customer;
    if (
      options?.allowAssignedWeeklyTask &&
      (await hasPendingWeeklyAssignmentForCustomer(userId, id))
    ) {
      return customer;
    }
    return null;
  }

  return customer;
}

export async function assertCustomerFollowUpWriteAccess(
  role: UserRole,
  userId: string,
  customer: CustomerResponsibleShape
) {
  if (!canEditCustomerFollowUp(role, userId, customer)) {
    throw new Error("无权为该客户录入往来");
  }
}

export async function assertCustomerContentWriteAccess(
  role: UserRole,
  userId: string,
  customer: CustomerResponsibleShape
) {
  if (!canEditCustomerContent(role, userId, customer)) {
    throw new Error("无权编辑该客户");
  }
}
