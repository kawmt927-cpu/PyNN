"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { buildSalesMonthlySnapshot } from "@/lib/sales/monthly-report";

function parseYearMonth(formData: FormData) {
  const year = Number.parseInt(String(formData.get("year") ?? ""), 10);
  const month = Number.parseInt(String(formData.get("month") ?? ""), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error("无效年份");
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("无效月份");
  }
  return { year, month };
}

/** 确认归档销售月报（幂等：同年月已归档则直接返回） */
export async function confirmSalesMonthlyReport(formData: FormData): Promise<void> {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
  const { year, month } = parseYearMonth(formData);

  const existing = await prisma.salesMonthlyReport.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (existing) {
    revalidatePath("/admin/sales-monthly");
    revalidatePath("/daily-reports/monthly");
    return;
  }

  const snapshot = await buildSalesMonthlySnapshot(year, month);

  try {
    await prisma.salesMonthlyReport.create({
      data: {
        year,
        month,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        confirmedById: session.user.id,
      },
    });
  } catch (error) {
    // 并发下唯一约束：视为已归档（幂等）
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      revalidatePath("/admin/sales-monthly");
      revalidatePath("/daily-reports/monthly");
      return;
    }
    throw error;
  }

  revalidatePath("/admin/sales-monthly");
  revalidatePath("/daily-reports/monthly");
}
