import { StaffCategory, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function staffCategoryForRole(role: UserRole): StaffCategory {
  if (
    role === UserRole.SALES ||
    role === UserRole.SALES_MANAGER ||
    role === UserRole.ADMIN ||
    role === UserRole.HR
  ) {
    return StaffCategory.SALES;
  }
  return StaffCategory.IMPLEMENTATION;
}

export async function getLatestWeComAccessRequest(wecomUserId: string) {
  return prisma.weComAccessRequest.findFirst({
    where: { wecomUserId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPendingWeComAccessRequests() {
  return prisma.weComAccessRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}

export async function countPendingWeComAccessRequests() {
  return prisma.weComAccessRequest.count({ where: { status: "PENDING" } });
}
