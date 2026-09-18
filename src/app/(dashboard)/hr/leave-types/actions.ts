"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { upsertLeaveType } from "@/lib/personnel/leave-types";

async function requireHr() {
  return requireRole(["HR", "ADMIN"]);
}

export async function saveLeaveTypeAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireHr();
    const id = String(formData.get("id") ?? "").trim() || null;
    const key = String(formData.get("key") ?? "").trim() || null;
    const label = String(formData.get("label") ?? "");
    const payFactor = Number(formData.get("payFactor"));
    const sortOrder = Number(formData.get("sortOrder") ?? 0);
    const countsAsAbsence = formData.get("countsAsAbsence") === "on";
    const exemptDailyReport = formData.get("exemptDailyReport") === "on";
    const enabled = formData.get("enabled") === "on";

    await upsertLeaveType({
      id,
      key,
      label,
      payFactor,
      sortOrder,
      countsAsAbsence,
      exemptDailyReport,
      enabled,
    });
    revalidatePath("/hr/leave-types");
    revalidatePath("/hr/leaves");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
