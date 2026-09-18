"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { cancelLeave, createManualLeave } from "@/lib/personnel/leaves";
import { ensureDefaultLeaveTypes } from "@/lib/personnel/leave-types";
import { prisma } from "@/lib/prisma";

async function requireHr() {
  return requireRole(["HR", "ADMIN"]);
}

export async function createLeaveAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireHr();
    await ensureDefaultLeaveTypes();
    const userId = String(formData.get("userId") ?? "").trim();
    const leaveTypeId = String(formData.get("leaveTypeId") ?? "").trim();
    const startDayKey = String(formData.get("startDayKey") ?? "").trim();
    const endDayKey = String(formData.get("endDayKey") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!userId || !leaveTypeId || !startDayKey || !endDayKey) {
      return { error: "请填写完整" };
    }
    await createManualLeave({
      userId,
      leaveTypeId,
      startDayKey,
      endDayKey,
      note: note || null,
      createdById: session.user.id,
    });
    revalidatePath("/hr/leaves");
    revalidatePath("/personnel");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelLeaveAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireHr();
    const leaveId = String(formData.get("leaveId") ?? "").trim();
    if (!leaveId) return { error: "缺少请假 id" };
    const row = await prisma.personnelLeave.findUnique({ where: { id: leaveId } });
    if (!row) return { error: "记录不存在" };
    await cancelLeave(leaveId);
    revalidatePath("/hr/leaves");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
