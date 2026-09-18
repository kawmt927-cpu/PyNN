import { prisma } from "@/lib/prisma";
import { CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";
import { enabledSalesTeamMemberWhere } from "@/lib/sales/selectable-users";

/** 追加一名协助负责人（不替换现有） */
export async function addCustomerAssistant(customerId: string, userId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { ownerId: true },
  });
  if (!customer) throw new Error("客户不存在");
  if (customer.ownerId === userId) return;

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...enabledSalesTeamMemberWhere(CUSTOMER_ASSIGNABLE_ROLES),
    },
    select: { id: true },
  });
  if (!user) throw new Error("协助负责人无效或已停用");

  await prisma.customerAssistant.upsert({
    where: { customerId_userId: { customerId, userId } },
    create: { customerId, userId },
    update: {},
  });
}

export async function replaceCustomerAssistants(
  customerId: string,
  userIds: string[],
  ownerId: string | null
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))].filter((id) => id !== ownerId);

  if (uniqueIds.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: uniqueIds },
        ...enabledSalesTeamMemberWhere(CUSTOMER_ASSIGNABLE_ROLES),
      },
      select: { id: true },
    });
    if (users.length !== uniqueIds.length) {
      throw new Error("协助负责人无效或已停用");
    }
  }

  await prisma.$transaction([
    prisma.customerAssistant.deleteMany({ where: { customerId } }),
    ...(uniqueIds.length > 0
      ? [
          prisma.customerAssistant.createMany({
            data: uniqueIds.map((userId) => ({ customerId, userId })),
          }),
        ]
      : []),
  ]);

  return uniqueIds;
}
