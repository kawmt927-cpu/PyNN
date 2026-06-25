import type { FollowUpMethod, Prisma } from "@prisma/client";
import { isCustomerResponsible } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";

const FOLLOW_UP_METHODS = [
  "PHONE",
  "WECHAT",
  "FACE_VISIT",
  "ONLINE_MEETING",
  "OTHER",
] as const satisfies readonly FollowUpMethod[];

function isFollowUpMethod(value: string): value is FollowUpMethod {
  return (FOLLOW_UP_METHODS as readonly string[]).includes(value);
}

export type CreateWeeklyAssignmentInput = {
  createdById: string;
  assigneeId: string;
  customerId: string;
  opportunityId?: string | null;
  contactId?: string | null;
  plannedMethod?: FollowUpMethod | null;
  title: string;
  description?: string | null;
  dueAt: Date;
};

function resolveAnchorMethod(plannedMethod?: FollowUpMethod | null): FollowUpMethod {
  if (plannedMethod) return plannedMethod;
  return "OTHER";
}

export async function createWeeklyAssignmentWithFollowUpPlan(input: CreateWeeklyAssignmentInput) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      ownerId: true,
      assistantOwners: { select: { userId: true } },
    },
  });
  if (!customer) throw new Error("客户不存在");
  if (!customer.ownerId) {
    throw new Error("公海客户需先指定负责人后再指派任务");
  }
  if (!isCustomerResponsible(input.assigneeId, customer)) {
    throw new Error("只能指派给该客户的负责人或协助负责人");
  }

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, customerId: input.customerId },
      select: { id: true },
    });
    if (!opportunity) throw new Error("商机不存在或不属于该客户");
  }

  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, customerId: input.customerId },
      select: { id: true },
    });
    if (!contact) throw new Error("联系人不属于该客户");
  }

  if (input.plannedMethod && !isFollowUpMethod(input.plannedMethod)) {
    throw new Error("往来方式无效");
  }

  const title = input.title.trim();
  const description = input.description?.trim() || null;
  const planContent = description || title;
  const anchorMethod = resolveAnchorMethod(input.plannedMethod ?? null);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.create({
      data: {
        customerId: input.customerId,
        contactId: input.contactId || undefined,
        opportunityId: input.opportunityId || undefined,
        userId: input.assigneeId,
        method: anchorMethod,
        content: `[指派任务] ${title}`,
        followUpAt: now,
        nextFollowUpAt: input.dueAt,
        nextFollowUpMethod: input.plannedMethod ?? undefined,
        nextFollowUpContent: planContent,
        ...(input.contactId
          ? {
              linkedContacts: {
                create: { contactId: input.contactId },
              },
            }
          : {}),
      },
    });

    const assignment = await tx.salesWeeklyAssignment.create({
      data: {
        createdById: input.createdById,
        assigneeId: input.assigneeId,
        customerId: input.customerId,
        opportunityId: input.opportunityId || undefined,
        title,
        description,
        dueAt: input.dueAt,
        followUpId: followUp.id,
      },
    });

    return { assignment, followUp };
  });
}

export async function cancelWeeklyAssignmentWithPlan(
  tx: Prisma.TransactionClient,
  assignmentId: string
) {
  const existing = await tx.salesWeeklyAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, status: true, followUpId: true },
  });
  if (!existing) throw new Error("任务不存在");
  if (existing.status !== "PENDING") throw new Error("只能取消待完成的任务");

  await tx.salesWeeklyAssignment.update({
    where: { id: assignmentId },
    data: { status: "CANCELLED" },
  });

  if (existing.followUpId) {
    await tx.followUp.updateMany({
      where: { id: existing.followUpId, nextFollowUpAt: { not: null } },
      data: { nextFollowUpAt: null, nextFollowUpMethod: null, nextFollowUpContent: null },
    });
  }
}

export async function completeWeeklyAssignmentForFollowUpPlan(
  tx: Prisma.TransactionClient,
  followUpId: string
) {
  await tx.salesWeeklyAssignment.updateMany({
    where: { followUpId, status: "PENDING" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}
