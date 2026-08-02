import type { FollowUpMethod, Prisma } from "@prisma/client";
import { isCustomerResponsible } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import { assignmentKindLabel } from "@/lib/today-work/weekly-assignments";

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

function formatDueAt(dueAt: Date) {
  return dueAt.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ASSIGNMENT_NOTIFY_HREF = "/plans-tasks?tab=tasks";

/** 指派给他人时：站内通知 + 企微推送；自派不发 */
async function notifyAssigneeOfNewAssignment(input: {
  assignmentId: string;
  kind: string;
  title: string;
  description?: string | null;
  dueAt: Date;
  createdById: string;
  assigneeId: string;
  customerName?: string | null;
}) {
  if (input.assigneeId === input.createdById) return;

  const creator = await prisma.user.findUnique({
    where: { id: input.createdById },
    select: { name: true },
  });
  const creatorName = creator?.name ?? "同事";
  const kindLabel = assignmentKindLabel(input.kind);
  const dueLabel = formatDueAt(input.dueAt);
  const bodyLines = [
    `${creatorName} 向你指派了${kindLabel}「${input.title}」`,
    `截止：${dueLabel}`,
  ];
  if (input.customerName) bodyLines.push(`客户：${input.customerName}`);
  if (input.description?.trim()) bodyLines.push(`说明：${input.description.trim()}`);

  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.WEEKLY_ASSIGNMENT_ASSIGNED,
    title: `新指派任务：${input.title}`,
    body: bodyLines.join("\n"),
    linkHref: ASSIGNMENT_NOTIFY_HREF,
    recipientUserIds: [input.assigneeId],
    // 企微用结构化卡片单独发送，避免多行正文被压成一句
    pushWeCom: false,
    meta: {
      assignmentId: input.assignmentId,
      kind: input.kind,
    },
  });

  void import("@/lib/wecom/notify")
    .then(({ pushWeComTextCardToCrmUsers }) =>
      pushWeComTextCardToCrmUsers({
        crmUserIds: [input.assigneeId],
        title: `新指派任务：${input.title}`,
        description: `${creatorName} 向你指派了${kindLabel}`,
        fields: [
          { keyname: "指派人", value: creatorName },
          { keyname: "类型", value: kindLabel },
          { keyname: "截止", value: dueLabel },
          ...(input.customerName
            ? [{ keyname: "客户", value: input.customerName }]
            : []),
        ],
        quoteTitle: "说明",
        quoteText: input.description?.trim() || input.title,
        url: ASSIGNMENT_NOTIFY_HREF,
        btnText: "查看",
      })
    )
    .catch((error) => console.error("[wecom-notify] assignment assigned", error));
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

export type CreateGeneralAssignmentInput = {
  createdById: string;
  assigneeId: string;
  title: string;
  description?: string | null;
  dueAt: Date;
};

function resolveAnchorMethod(plannedMethod?: FollowUpMethod | null): FollowUpMethod {
  if (plannedMethod) return plannedMethod;
  return "OTHER";
}

async function assertEnabledSalesAssignee(assigneeId: string) {
  const assignee = await prisma.user.findFirst({
    where: {
      id: assigneeId,
      role: { in: ["SALES", "SALES_MANAGER", "ADMIN"] },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  if (!assignee) throw new Error("所选人员无效或已停用");
}

/** 普通任务：无客户、无往来锚点 */
export async function createGeneralWeeklyAssignment(input: CreateGeneralAssignmentInput) {
  await assertEnabledSalesAssignee(input.assigneeId);
  const title = input.title.trim();
  if (!title) throw new Error("请输入任务标题");
  const description = input.description?.trim() || null;

  const assignment = await prisma.salesWeeklyAssignment.create({
    data: {
      kind: "GENERAL",
      createdById: input.createdById,
      assigneeId: input.assigneeId,
      title,
      description,
      dueAt: input.dueAt,
      status: "PENDING",
    },
  });

  await notifyAssigneeOfNewAssignment({
    assignmentId: assignment.id,
    kind: assignment.kind,
    title: assignment.title,
    description: assignment.description,
    dueAt: assignment.dueAt,
    createdById: input.createdById,
    assigneeId: input.assigneeId,
  });

  return assignment;
}

export async function createWeeklyAssignmentWithFollowUpPlan(input: CreateWeeklyAssignmentInput) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      assistantOwners: { select: { userId: true } },
    },
  });
  if (!customer) throw new Error("客户不存在");

  const claimFromPool = customer.ownerId === null;
  if (claimFromPool) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: input.assigneeId,
        role: { in: ["SALES", "SALES_MANAGER", "ADMIN"] },
        personnelProfile: { enabled: true },
      },
      select: { id: true },
    });
    if (!assignee) throw new Error("所选销售无效或已停用");
  } else {
    if (!isCustomerResponsible(input.assigneeId, customer)) {
      throw new Error("只能指派给该客户的负责人或协助负责人");
    }
    const assignee = await prisma.user.findFirst({
      where: { id: input.assigneeId },
      select: { id: true },
    });
    if (!assignee) throw new Error("所选销售不存在");
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

  const result = await prisma.$transaction(async (tx) => {
    if (claimFromPool) {
      const stillPool = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { ownerId: true },
      });
      if (!stillPool) throw new Error("客户不存在");
      if (stillPool.ownerId !== null) {
        throw new Error("该客户已被其他人领走，请刷新后重试");
      }
      await tx.customer.update({
        where: { id: input.customerId },
        data: { ownerId: input.assigneeId },
      });
      await tx.customerClaimRequest.updateMany({
        where: { customerId: input.customerId, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewerId: input.createdById,
          reviewNote: "指派任务时已指定负责人",
          reviewedAt: now,
        },
      });
    }

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
        kind: "CUSTOMER_FOLLOW_UP",
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

  await notifyAssigneeOfNewAssignment({
    assignmentId: result.assignment.id,
    kind: result.assignment.kind,
    title: result.assignment.title,
    description: result.assignment.description,
    dueAt: result.assignment.dueAt,
    createdById: input.createdById,
    assigneeId: input.assigneeId,
    customerName: customer.name,
  });

  return result;
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
  if (existing.status !== "PENDING" && existing.status !== "PENDING_CONFIRM") {
    throw new Error("只能取消未完成的任务");
  }

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

/**
 * 执行人标记普通任务完成。
 * - 自派：直接 COMPLETED
 * - 他人指派：进入 PENDING_CONFIRM，待指派人确认
 */
export async function markGeneralAssignmentDone(input: {
  assignmentId: string;
  actorUserId: string;
  note?: string | null;
}) {
  const row = await prisma.salesWeeklyAssignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      kind: true,
      status: true,
      assigneeId: true,
      createdById: true,
    },
  });
  if (!row) throw new Error("任务不存在");
  if (row.kind !== "GENERAL") throw new Error("仅普通任务支持此操作");
  if (row.status !== "PENDING") throw new Error("任务当前状态不可标记完成");
  if (row.assigneeId !== input.actorUserId) throw new Error("仅被指派人可标记完成");

  const note = input.note?.trim() || null;
  const now = new Date();
  const selfAssigned = row.assigneeId === row.createdById;

  if (selfAssigned) {
    return prisma.salesWeeklyAssignment.update({
      where: { id: row.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        assigneeNote: note,
        confirmedAt: now,
        confirmedById: input.actorUserId,
      },
    });
  }

  const updated = await prisma.salesWeeklyAssignment.update({
    where: { id: row.id },
    data: {
      status: "PENDING_CONFIRM",
      completedAt: now,
      assigneeNote: note,
    },
    include: {
      assignee: { select: { id: true, name: true } },
    },
  });

  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.GENERAL_ASSIGNMENT_PENDING_CONFIRM,
    title: "普通任务待确认",
    body: `${updated.assignee.name} 已完成「${updated.title}」，请确认。${
      note ? `\n说明：${note}` : ""
    }`,
    linkHref: "/plans-tasks?tab=tasks",
    recipientUserIds: [row.createdById],
    pushWeCom: true,
    meta: {
      assignmentId: updated.id,
      action: "confirm_general_assignment",
    },
  });

  return updated;
}

/** 指派人确认普通任务完成 */
export async function confirmGeneralAssignment(input: {
  assignmentId: string;
  actorUserId: string;
}) {
  const row = await prisma.salesWeeklyAssignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      kind: true,
      status: true,
      createdById: true,
    },
  });
  if (!row) throw new Error("任务不存在");
  if (row.kind !== "GENERAL") throw new Error("仅普通任务支持此操作");
  if (row.status !== "PENDING_CONFIRM") throw new Error("任务当前不在待确认状态");
  if (row.createdById !== input.actorUserId) throw new Error("仅指派人可确认完成");

  return prisma.salesWeeklyAssignment.update({
    where: { id: row.id },
    data: {
      status: "COMPLETED",
      confirmedAt: new Date(),
      confirmedById: input.actorUserId,
    },
  });
}

/** 指派人驳回，退回待完成 */
export async function rejectGeneralAssignment(input: {
  assignmentId: string;
  actorUserId: string;
}) {
  const row = await prisma.salesWeeklyAssignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      kind: true,
      status: true,
      createdById: true,
    },
  });
  if (!row) throw new Error("任务不存在");
  if (row.kind !== "GENERAL") throw new Error("仅普通任务支持此操作");
  if (row.status !== "PENDING_CONFIRM") throw new Error("任务当前不在待确认状态");
  if (row.createdById !== input.actorUserId) throw new Error("仅指派人可驳回");

  return prisma.salesWeeklyAssignment.update({
    where: { id: row.id },
    data: {
      status: "PENDING",
      completedAt: null,
      assigneeNote: null,
      confirmedAt: null,
      confirmedById: null,
    },
  });
}
