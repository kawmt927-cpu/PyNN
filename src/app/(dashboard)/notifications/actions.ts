"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/app-notifications";

export async function markNotificationAsRead(receiptId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "PROJECT_ADMIN", "ADMIN"]);
    const ok = await markNotificationRead(session.user.id, receiptId);
    if (!ok) return { error: "通知不存在" };
    revalidatePath("/notifications");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function markAllAsRead(): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "PROJECT_ADMIN", "ADMIN"]);
    await markAllNotificationsRead(session.user.id);
    revalidatePath("/notifications");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "操作失败" };
  }
}
