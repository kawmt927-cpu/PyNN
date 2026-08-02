import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const NOTIFICATION_TYPES = {
  CHECK_IN_LOCATION_IP_MISMATCH: "CHECK_IN_LOCATION_IP_MISMATCH",
  GENERAL_ASSIGNMENT_PENDING_CONFIRM: "GENERAL_ASSIGNMENT_PENDING_CONFIRM",
  WEEKLY_ASSIGNMENT_ASSIGNED: "WEEKLY_ASSIGNMENT_ASSIGNED",
  CONTRACT_REJECTED: "CONTRACT_REJECTED",
  DAILY_REPORT_REMIND: "DAILY_REPORT_REMIND",
  DAILY_REPORT_LATE: "DAILY_REPORT_LATE",
} as const;

/** 可进入「通知」页的角色（按业务线分别接收；销售可收合同驳回等个人通知） */
export const NOTIFICATION_ACCESS_ROLES: UserRole[] = [
  "SALES",
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "ADMIN",
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
  return NOTIFICATION_ACCESS_ROLES.includes(role);
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
