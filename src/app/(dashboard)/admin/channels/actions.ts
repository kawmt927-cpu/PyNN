"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { ensureChannelCoverageConfig } from "@/lib/customers/channel-kind";

const schema = z.object({
  integratorTarget: z.coerce.number().int().min(0).max(999),
  hrpVendorTarget: z.coerce.number().int().min(0).max(999),
  competitorTarget: z.coerce.number().int().min(0).max(999),
});

export async function saveChannelCoverageTargets(
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole(["ADMIN"]);
    const data = schema.parse({
      integratorTarget: formData.get("integratorTarget"),
      hrpVendorTarget: formData.get("hrpVendorTarget"),
      competitorTarget: formData.get("competitorTarget"),
    });
    await ensureChannelCoverageConfig();
    await prisma.channelCoverageConfig.update({
      where: { id: "default" },
      data: {
        ...data,
        updatedById: session.user.id,
      },
    });
    revalidatePath("/admin/stats/channels");
    revalidatePath("/admin/channels");
    return {};
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.errors[0]?.message ?? "目标校验失败" };
    }
    return { error: e instanceof Error ? e.message : "保存失败" };
  }
}
