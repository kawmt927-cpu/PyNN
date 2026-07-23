import { prisma } from "@/lib/prisma";

export const ENTITY_TYPES = {
  CUSTOMER: "CUSTOMER",
  OPPORTUNITY: "OPPORTUNITY",
  CONTRACT: "CONTRACT",
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

export async function recordEntityOperation(input: {
  entityType: EntityType;
  entityId: string;
  userId: string;
  action: string;
  summary: string;
  detail?: string | null;
}) {
  try {
    await prisma.entityOperationLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        action: input.action,
        summary: input.summary,
        detail: input.detail?.trim() || undefined,
      },
    });
  } catch (error) {
    console.error("[entity-operation-log] failed to record", error);
  }
}

export async function listEntityOperationLogs(entityType: EntityType, entityId: string, take = 50) {
  return prisma.entityOperationLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}
