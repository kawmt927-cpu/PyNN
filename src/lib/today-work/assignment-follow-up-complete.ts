import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PendingAssignmentForFollowUp = {
  id: string;
  title: string;
  dueAt: string;
  customerId: string | null;
  customerName: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  followUpId: string | null;
};

/** 当前销售对该客户（可选商机）的未完成客户跟进指派 */
export async function listPendingAssignmentsForFollowUp(input: {
  assigneeId: string;
  customerId: string;
  opportunityIds?: string[];
}): Promise<PendingAssignmentForFollowUp[]> {
  const opportunityIds = [...new Set((input.opportunityIds ?? []).filter(Boolean))];
  const rows = await prisma.salesWeeklyAssignment.findMany({
    where: {
      assigneeId: input.assigneeId,
      customerId: input.customerId,
      kind: "CUSTOMER_FOLLOW_UP",
      status: "PENDING",
      ...(opportunityIds.length > 0
        ? {
            OR: [{ opportunityId: null }, { opportunityId: { in: opportunityIds } }],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      customerId: true,
      followUpId: true,
      customer: { select: { name: true } },
      opportunity: { select: { id: true, title: true } },
    },
    orderBy: { dueAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    opportunityId: row.opportunity?.id ?? null,
    opportunityTitle: row.opportunity?.title ?? null,
    followUpId: row.followUpId,
  }));
}

/** 按指派 ID 完成任务；同时清掉锚点 FollowUp 的下次计划 */
export async function completeWeeklyAssignmentsByIds(
  tx: Prisma.TransactionClient,
  input: {
    assigneeId: string;
    assignmentIds: string[];
  }
) {
  const ids = [...new Set(input.assignmentIds.filter(Boolean))];
  if (ids.length === 0) return;

  const rows = await tx.salesWeeklyAssignment.findMany({
    where: {
      id: { in: ids },
      assigneeId: input.assigneeId,
      kind: "CUSTOMER_FOLLOW_UP",
      status: "PENDING",
    },
    select: { id: true, followUpId: true },
  });
  if (rows.length !== ids.length) {
    throw new Error("所选任务无效或已完成");
  }

  const now = new Date();
  await tx.salesWeeklyAssignment.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: "COMPLETED", completedAt: now },
  });

  const followUpIds = rows
    .map((r) => r.followUpId)
    .filter((id): id is string => Boolean(id));
  if (followUpIds.length > 0) {
    await tx.followUp.updateMany({
      where: { id: { in: followUpIds }, nextFollowUpAt: { not: null } },
      data: { nextFollowUpAt: null, nextFollowUpMethod: null, nextFollowUpContent: null },
    });
  }
}

/** 助手路径：自动完成该客户下匹配的未完成指派 */
export async function autoCompleteMatchingAssignments(input: {
  assigneeId: string;
  customerId: string;
  opportunityIds?: string[];
  skip?: boolean;
}) {
  if (input.skip) return { completedIds: [] as string[] };
  const pending = await listPendingAssignmentsForFollowUp(input);
  if (pending.length === 0) return { completedIds: [] as string[] };

  const opportunityIds = new Set((input.opportunityIds ?? []).filter(Boolean));
  const toComplete =
    opportunityIds.size > 0
      ? pending.filter(
          (row) => !row.opportunityId || opportunityIds.has(row.opportunityId)
        )
      : pending;

  if (toComplete.length === 0) return { completedIds: [] as string[] };

  await prisma.$transaction(async (tx) => {
    await completeWeeklyAssignmentsByIds(tx, {
      assigneeId: input.assigneeId,
      assignmentIds: toComplete.map((r) => r.id),
    });
  });

  return { completedIds: toComplete.map((r) => r.id) };
}
