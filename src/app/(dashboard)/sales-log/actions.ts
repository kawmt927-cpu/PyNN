"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { ensureTodayDailyLog } from "@/lib/sales-log/daily-log";
import { createFollowUpFromAgent } from "@/lib/sales-log/write";
import { manualLogFormSchema } from "@/lib/validations/sales-log";

export async function createManualLogAction(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  try {
    const parsed = manualLogFormSchema.parse({
      customerId: formData.get("customerId"),
      contactId: formData.get("contactId") || null,
      method: formData.get("method"),
      content: formData.get("content"),
      result: formData.get("result") || null,
      followUpAt: formData.get("followUpAt"),
      nextFollowUpAt: formData.get("nextFollowUpAt") || null,
      location: formData.get("location") || null,
      detailedNotes: formData.get("detailedNotes") || null,
    });

    const dailyLog = await ensureTodayDailyLog(session.user.id);

    await createFollowUpFromAgent(
      {
        userId: session.user.id,
        role: session.user.role,
        dailyLogId: dailyLog.id,
      },
      {
        customerId: parsed.customerId,
        contactId: parsed.contactId || undefined,
        method: parsed.method,
        content: parsed.content,
        result: parsed.result ?? undefined,
        followUpAt: parsed.followUpAt,
        nextFollowUpAt: parsed.nextFollowUpAt ?? undefined,
        location: parsed.location ?? undefined,
        detailedNotes: parsed.detailedNotes ?? undefined,
      }
    );

    revalidatePath("/sales-log");
    revalidatePath("/follow-ups");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message ?? "表单无效" };
    }
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}
