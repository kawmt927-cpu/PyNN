"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { ensureTodayDailyLog } from "@/lib/sales-log/daily-log";
import { createFollowUpFromAgent } from "@/lib/sales-log/write";
import { manualLogFormSchema } from "@/lib/validations/sales-log";
import type { FollowUpMethod } from "@prisma/client";

export async function createManualLogAction(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  try {
    const parsed = manualLogFormSchema.parse({
      customerId: formData.get("customerId"),
      contactId: formData.get("contactId"),
      method: formData.get("method"),
      content: formData.get("content"),
      result: formData.get("result") || null,
      followUpAt: formData.get("followUpAt"),
      suggestedGrade: formData.get("suggestedGrade") || null,
      opportunityId: formData.get("opportunityId") || null,
      nextFollowUpAt: formData.get("nextFollowUpAt") || null,
      nextFollowUpMethod: formData.get("nextFollowUpMethod") || null,
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
        contactId: parsed.contactId,
        opportunityId: parsed.opportunityId || undefined,
        method: parsed.method,
        content: parsed.content,
        result: parsed.result ?? undefined,
        followUpAt: parsed.followUpAt,
        nextFollowUpAt: parsed.nextFollowUpAt ?? undefined,
        nextFollowUpMethod: (parsed.nextFollowUpMethod as FollowUpMethod | null) || undefined,
        suggestedGrade: parsed.suggestedGrade,
      }
    );

    revalidatePath("/sales-log");
    revalidatePath("/today-work");
    revalidatePath("/follow-ups");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message ?? "表单无效" };
    }
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}
