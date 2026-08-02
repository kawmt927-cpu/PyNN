"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_ACCESS_ROLES,
} from "@/lib/notifications/app-notifications";

export async function markNotificationAsRead(receiptId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(NOTIFICATION_ACCESS_ROLES);
    const ok = await markNotificationRead(session.user.id, receiptId);
    if (!ok) return { error: "通知不存在" };
    revalidatePath("/notifications");
    revalidatePath("/mobile/inbox");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function markAllAsRead(): Promise<ActionResult> {
  try {
    const session = await requireRole(NOTIFICATION_ACCESS_ROLES);
    await markAllNotificationsRead(session.user.id);
    revalidatePath("/notifications");
    revalidatePath("/mobile/inbox");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "操作失败" };
  }
}
