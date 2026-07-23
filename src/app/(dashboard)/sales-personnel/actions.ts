"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { SALES_FUNCTION_ROLES } from "@/lib/sales/team-performance";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

/** 批量更新销售功能人员：团队业绩 / 月度考核参与开关 */
export async function updateSalesPersonnelFlagsBatch(
  rows: Array<{
    userId: string;
    includeInTeamPerformance: boolean;
    includeInMonthlyAssessment: boolean;
  }>
): Promise<ActionResult> {
  try {
    await requireRole(["SALES_MANAGER", "ADMIN"]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { error: "没有可保存的人员" };
    }

    for (const row of rows) {
      if (!row.userId) throw new Error("缺少用户 ID");
      const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: {
          role: true,
          personnelProfile: { select: { enabled: true } },
        },
      });
      if (!user || !SALES_FUNCTION_ROLES.includes(user.role)) {
        throw new Error("存在非销售功能人员，已中止保存");
      }
      const enabled = user.personnelProfile?.enabled ?? false;
      await prisma.user.update({
        where: { id: row.userId },
        data: {
          includeInTeamPerformance: enabled ? Boolean(row.includeInTeamPerformance) : false,
          includeInMonthlyAssessment: enabled ? Boolean(row.includeInMonthlyAssessment) : false,
        },
      });
    }

    revalidatePath("/sales-personnel");
    revalidatePath("/plans-tasks");
    revalidatePath("/today-work");
    revalidatePath("/mobile/metrics");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
