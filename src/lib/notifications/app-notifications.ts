import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const NOTIFICATION_TYPES = {
  CHECK_IN_LOCATION_IP_MISMATCH: "CHECK_IN_LOCATION_IP_MISMATCH",
} as const;

export const NOTIFICATION_RECIPIENT_ROLES: UserRole[] = [
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "ADMIN",
];

export function canAccessNotifications(role: UserRole) {
  return NOTIFICATION_RECIPIENT_ROLES.includes(role);
}

async function listRecipientUserIds() {
  const users = await prisma.user.findMany({
    where: {
      role: { in: NOTIFICATION_RECIPIENT_ROLES },
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
}) {
  const recipientIds = input.recipientUserIds?.length
    ? [...new Set(input.recipientUserIds)]
    : await listRecipientUserIds();
  if (recipientIds.length === 0) return null;

  return prisma.appNotification.create({
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
}

export async function countUnreadNotifications(userId: string) {
  return prisma.appNotificationReceipt.count({
    where: { userId, readAt: null },
  });
}

export async function listNotificationsForUser(userId: string, take = 50) {
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
