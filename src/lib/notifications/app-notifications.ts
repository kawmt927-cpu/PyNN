import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

export const NOTIFICATION_TYPES = {
  CHECK_IN_LOCATION_IP_MISMATCH: "CHECK_IN_LOCATION_IP_MISMATCH",
  GENERAL_ASSIGNMENT_PENDING_CONFIRM: "GENERAL_ASSIGNMENT_PENDING_CONFIRM",
  WEEKLY_ASSIGNMENT_ASSIGNED: "WEEKLY_ASSIGNMENT_ASSIGNED",
  FOLLOW_UP_PENDING_CONFIRM: "FOLLOW_UP_PENDING_CONFIRM",
  FOLLOW_UP_CONFIRM_RESULT: "FOLLOW_UP_CONFIRM_RESULT",
  CONTACT_PENDING_CONFIRM: "CONTACT_PENDING_CONFIRM",
  CONTACT_CONFIRM_RESULT: "CONTACT_CONFIRM_RESULT",
  OPPORTUNITY_PENDING_CONFIRM: "OPPORTUNITY_PENDING_CONFIRM",
  OPPORTUNITY_CONFIRM_RESULT: "OPPORTUNITY_CONFIRM_RESULT",
  CONTRACT_REJECTED: "CONTRACT_REJECTED",
  DAILY_REPORT_REMIND: "DAILY_REPORT_REMIND",
  DAILY_REPORT_LATE: "DAILY_REPORT_LATE",
  /** 项目阶段完成且分期升为可催款 */
  PHASE_COLLECTION_READY: "PHASE_COLLECTION_READY",
  /** 项目阶段完成但未绑分期 / 无可提升分期，提醒准备沟通 */
  PHASE_COLLECTION_PREPARE: "PHASE_COLLECTION_PREPARE",
  /** 公司日历（法定假/调休）年度同步结果 */
  COMPANY_CALENDAR_SYNC: "COMPANY_CALENDAR_SYNC",
  HR_DOCUMENT_EXPIRY: "HR_DOCUMENT_EXPIRY",
} as const;

/** 可进入「通知」页的角色（按业务线分别接收；销售可收合同驳回等个人通知） */
export const NOTIFICATION_ACCESS_ROLES: UserRole[] = [
  "SALES",
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "ADMIN",
  "HR",
];

/** @deprecated 使用 NOTIFICATION_ACCESS_ROLES */
export const NOTIFICATION_RECIPIENT_ROLES = NOTIFICATION_ACCESS_ROLES;

const SALES_LINE_ROLES: UserRole[] = ["SALES", "SALES_MANAGER"];
const PROJECT_LINE_ROLES: UserRole[] = [
  "PROJECT_STAFF",
  "PROJECT_MANAGER",
  "PROJECT_ADMIN",
];

export function canAccessNotifications(role: UserRole) {
  return hasPermissionSync(role, "nav.notifications");
}

/**
 * 按打卡人角色决定上级接收人：
 * - 销售线 → 销售管理 + 管理员
 * - 项目线 → 项目管理员 + 管理员
 */
export function recipientRolesForActor(actorRole: UserRole): UserRole[] {
  if (SALES_LINE_ROLES.includes(actorRole)) {
    return ["SALES_MANAGER", "ADMIN"];
  }
  if (PROJECT_LINE_ROLES.includes(actorRole)) {
    return ["PROJECT_ADMIN", "ADMIN"];
  }
  return ["ADMIN"];
}

async function listRecipientUserIds(roles: UserRole[], excludeUserId?: string | null) {
  const users = await prisma.user.findMany({
    where: {
      role: { in: roles },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function createAppNotification(input: {
  type: string;
  title: string;
  body: string;
  linkHref?: string | null;
  meta?: Record<string, unknown> | null;
  recipientUserIds?: string[];
  /** 按打卡人角色解析上级；与 recipientUserIds 二选一，显式 ids 优先 */
  actorRole?: UserRole;
  /** 不推送给本人 */
  excludeUserId?: string | null;
  /** 默认 true：同时发企微应用消息（可到微信插件） */
  pushWeCom?: boolean;
}) {
  const recipientIds = input.recipientUserIds?.length
    ? [...new Set(input.recipientUserIds)].filter((id) => id !== input.excludeUserId)
    : await listRecipientUserIds(
        input.actorRole
          ? recipientRolesForActor(input.actorRole)
          : NOTIFICATION_ACCESS_ROLES,
        input.excludeUserId
      );
  if (recipientIds.length === 0) return null;

  const notification = await prisma.appNotification.create({
    data: {
      type: input.type,
      title: input.title,
      body: input.body,
      linkHref: input.linkHref ?? undefined,
      metaJson: input.meta ? JSON.stringify(input.meta) : undefined,
      receipts: {
        create: recipientIds.map((userId) => ({ userId })),
      },
    },
  });

  if (input.pushWeCom !== false) {
    void import("@/lib/wecom/notify")
      .then(({ pushWeComTextCardToCrmUsers }) =>
        pushWeComTextCardToCrmUsers({
          crmUserIds: recipientIds,
          title: input.title,
          description: input.body,
          url: input.linkHref || "/mobile/inbox",
          btnText: "查看",
        })
      )
      .catch((error) => console.error("[wecom-notify] app notification", error));
  }

  return notification;
}

/** 删除指向已不存在通知的收据（SQLite 未开 FK 时手工删通知会残留） */
export async function cleanupOrphanNotificationReceipts() {
  const result = await prisma.$executeRawUnsafe(`
    DELETE FROM AppNotificationReceipt
    WHERE notificationId NOT IN (SELECT id FROM AppNotification)
  `);
  return typeof result === "number" ? result : 0;
}

export async function countUnreadNotifications(userId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: number | bigint }>>(
    `SELECT COUNT(*) AS c
     FROM AppNotificationReceipt r
     INNER JOIN AppNotification n ON n.id = r.notificationId
     WHERE r.userId = ? AND r.readAt IS NULL`,
    userId
  );
  const value = rows[0]?.c ?? 0;
  return typeof value === "bigint" ? Number(value) : Number(value);
}

export async function listNotificationsForUser(userId: string, take = 50) {
  await cleanupOrphanNotificationReceipts();
  return prisma.appNotificationReceipt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      notification: true,
    },
  });
}

export async function markNotificationRead(userId: string, receiptId: string) {
  const receipt = await prisma.appNotificationReceipt.findFirst({
    where: { id: receiptId, userId },
  });
  if (!receipt) return false;
  if (!receipt.readAt) {
    await prisma.appNotificationReceipt.update({
      where: { id: receiptId },
      data: { readAt: new Date() },
    });
  }
  return true;
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.appNotificationReceipt.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

function parseAssignmentIdFromMeta(metaJson: string | null | undefined): string | null {
  if (!metaJson) return null;
  try {
    const meta = JSON.parse(metaJson) as { assignmentId?: unknown };
    return typeof meta.assignmentId === "string" ? meta.assignmentId : null;
  } catch {
    return null;
  }
}

/** 普通任务确认/驳回后：更新通知文案并标为已读 */
export async function resolveGeneralAssignmentConfirmNotifications(input: {
  assignmentId: string;
  outcome: "confirmed" | "rejected";
  assignmentTitle?: string;
}) {
  const candidates = await prisma.appNotification.findMany({
    where: {
      type: NOTIFICATION_TYPES.GENERAL_ASSIGNMENT_PENDING_CONFIRM,
      metaJson: { contains: input.assignmentId },
    },
    select: { id: true, metaJson: true, body: true },
  });

  const matchedIds = candidates
    .filter((row) => parseAssignmentIdFromMeta(row.metaJson) === input.assignmentId)
    .map((row) => row.id);
  if (matchedIds.length === 0) return;

  const title =
    input.outcome === "confirmed" ? "普通任务已确认" : "普通任务已驳回";
  const titleLabel = input.assignmentTitle?.trim();
  const body =
    input.outcome === "confirmed"
      ? titleLabel
        ? `「${titleLabel}」已确认完成。`
        : "该任务已确认完成。"
      : titleLabel
        ? `「${titleLabel}」已驳回，已退回执行人待完成。`
        : "该任务已驳回，已退回执行人待完成。";

  await prisma.$transaction([
    prisma.appNotification.updateMany({
      where: { id: { in: matchedIds } },
      data: { title, body },
    }),
    prisma.appNotificationReceipt.updateMany({
      where: { notificationId: { in: matchedIds }, readAt: null },
      data: { readAt: new Date() },
    }),
  ]);
}

/**
 * 打开通知页时：若任务已不在「待确认」，同步通知文案并标已读（兼容在计划与任务里先处理的情况）
 */
export async function syncGeneralAssignmentConfirmNotificationsForUser(userId: string) {
  const receipts = await prisma.appNotificationReceipt.findMany({
    where: {
      userId,
      notification: { type: NOTIFICATION_TYPES.GENERAL_ASSIGNMENT_PENDING_CONFIRM },
    },
    select: {
      readAt: true,
      notification: { select: { metaJson: true, title: true } },
    },
    take: 100,
  });
  if (receipts.length === 0) return;

  const assignmentIds = [
    ...new Set(
      receipts
        .map((row) => parseAssignmentIdFromMeta(row.notification.metaJson))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (assignmentIds.length === 0) return;

  const assignments = await prisma.salesWeeklyAssignment.findMany({
    where: { id: { in: assignmentIds } },
    select: { id: true, title: true, status: true },
  });

  for (const assignment of assignments) {
    if (assignment.status === "PENDING_CONFIRM") continue;
    const stillPendingUi = receipts.some((row) => {
      const id = parseAssignmentIdFromMeta(row.notification.metaJson);
      return (
        id === assignment.id &&
        (row.notification.title === "普通任务待确认" || !row.readAt)
      );
    });
    if (!stillPendingUi) continue;

    await resolveGeneralAssignmentConfirmNotifications({
      assignmentId: assignment.id,
      outcome: assignment.status === "COMPLETED" ? "confirmed" : "rejected",
      assignmentTitle: assignment.title,
    });
  }
}

/**
 * 为当前用户补发「已驳回合同」通知（列表不再展示驳回单时，保证发起人仍可处理历史数据）
 */
export async function ensureRejectedContractNotificationsForUser(userId: string) {
  const rejected = await prisma.contract.findMany({
    where: {
      status: "REJECTED",
      OR: [{ submittedById: userId }, { submittedById: null, ownerId: userId }],
    },
    select: {
      id: true,
      title: true,
      rejectReason: true,
      submittedById: true,
      ownerId: true,
    },
    take: 50,
  });
  if (rejected.length === 0) return;

  const existing = await prisma.appNotification.findMany({
    where: {
      type: NOTIFICATION_TYPES.CONTRACT_REJECTED,
      receipts: { some: { userId } },
    },
    select: { metaJson: true },
    take: 200,
  });
  const knownIds = new Set(
    existing
      .map((row) => {
        if (!row.metaJson) return null;
        try {
          const meta = JSON.parse(row.metaJson) as { contractId?: string };
          return meta.contractId ?? null;
        } catch {
          return null;
        }
      })
      .filter((id): id is string => Boolean(id))
  );

  for (const contract of rejected) {
    const initiatorId = contract.submittedById || contract.ownerId;
    if (initiatorId !== userId) continue;
    if (knownIds.has(contract.id)) continue;
    await createAppNotification({
      type: NOTIFICATION_TYPES.CONTRACT_REJECTED,
      title: `合同已驳回：${contract.title}`,
      body: contract.rejectReason
        ? `驳回原因：${contract.rejectReason}\n可删除该合同，或修改后重新申请。`
        : "可删除该合同，或修改后重新申请。",
      linkHref: `/contracts/${contract.id}?edit=1`,
      meta: { contractId: contract.id },
      recipientUserIds: [userId],
      pushWeCom: false,
    });
  }
}
