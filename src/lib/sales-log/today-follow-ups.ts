import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTodayRange, salesCheckInListWhere } from "@/lib/sales-log/access";

export async function listTodayFollowUps(role: UserRole, userId: string) {
  const { start, end } = getTodayRange();
  const ownerFilter = salesCheckInListWhere(role, userId);

  return prisma.followUp.findMany({
    where: {
      followUpAt: { gte: start, lt: end },
      ...("userId" in ownerFilter ? { userId: ownerFilter.userId } : {}),
    },
    orderBy: { followUpAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      contact: { select: { name: true } },
      user: { select: { name: true } },
      salesCheckIn: { select: { id: true } },
    },
  });
}
