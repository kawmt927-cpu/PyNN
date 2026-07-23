import { prisma } from "@/lib/prisma";
import { CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";
import { enabledSalesTeamMemberWhere } from "@/lib/sales/selectable-users";

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
