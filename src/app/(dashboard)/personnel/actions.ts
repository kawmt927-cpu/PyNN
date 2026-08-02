"use server";

import { revalidatePath } from "next/cache";
import { PersonnelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  computeMonthlyCost,
  isFutureYearMonth,
  resolveDailyRateForMonth,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

function parseOptionalMoney(raw: unknown, label: string): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`${label}无效`);
  }
  return value;
}

function parseAdjustment(raw: unknown): number {
  if (raw == null) return 0;
  const text = String(raw).trim();
  if (!text) return 0;
  const value = Number(text);
  if (Number.isNaN(value)) throw new Error("本月调整额无效");
  return value;
}

function parsePersonnelType(raw: string | undefined): PersonnelType | null {
  if (!raw || raw === "NONE") return null;
  return raw as PersonnelType;
}

export type PersonnelCostRowInput = {
  userId: string;
  contributionBase: string;
  baseSalary: string;
  socialSecurityCompany: string;
  housingFundCompany: string;
  monthAdjustment: string;
  monthAdjustmentNotes: string;
};

/** 批量更新实施人员类型（人员信息标签） */
export async function updatePersonnelTypesBatch(
  rows: Array<{ userId: string; personnelType: string }>
): Promise<ActionResult> {
  try {
    await requireRole(["PROJECT_ADMIN", "ADMIN"]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { error: "没有可保存的人员" };
    }

    for (const row of rows) {
      if (!row.userId) throw new Error("缺少用户 ID");
      const profile = await prisma.personnelProfile.findUnique({
        where: { userId: row.userId },
      });
      if (!profile || profile.staffCategory !== "IMPLEMENTATION") {
        throw new Error("存在非实施人员记录，已中止保存");
      }
      await prisma.personnelProfile.update({
        where: { userId: row.userId },
        data: { personnelType: parsePersonnelType(row.personnelType) },
      });
    }

    revalidatePath("/personnel");
    revalidatePath("/projects/schedule");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

/** 批量保存指定月份的人员成本；保存后项目成本按新月成本重新核算 */
export async function updatePersonnelCostsBatch(input: {
  year: number;
  month: number;
  rows: PersonnelCostRowInput[];
}): Promise<ActionResult> {
  try {
    await requireRole(["PROJECT_ADMIN", "ADMIN"]);
    if (!input.year || input.month < 1 || input.month > 12) {
      return { error: "月份无效" };
    }
    if (isFutureYearMonth(input.year, input.month)) {
      return { error: "不能维护尚未到达的月份" };
    }
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      return { error: "没有可保存的人员" };
    }

    const now = new Date();
    const isCurrentMonth =
      input.year === now.getFullYear() && input.month === now.getMonth() + 1;

    for (const row of input.rows) {
      if (!row.userId) throw new Error("缺少用户 ID");

      const contributionBase = parseOptionalMoney(row.contributionBase, "缴费基数");
      const baseSalary = parseOptionalMoney(row.baseSalary, "基本工资");
      const socialSecurityCompany = parseOptionalMoney(
        row.socialSecurityCompany,
        "社保公司承担"
      );
      const housingFundCompany = parseOptionalMoney(
        row.housingFundCompany,
        "公积金公司承担"
      );
      const monthAdjustment = parseAdjustment(row.monthAdjustment);
      const notes = row.monthAdjustmentNotes?.trim() || null;

      const profile = await prisma.personnelProfile.findUnique({
        where: { userId: row.userId },
      });
      if (!profile || profile.staffCategory !== "IMPLEMENTATION") {
        throw new Error("存在非实施人员记录，已中止保存");
      }

      await prisma.personnelMonthlyCostAdjustment.upsert({
        where: {
          userId_year_month: {
            userId: row.userId,
            year: input.year,
            month: input.month,
          },
        },
        create: {
          userId: row.userId,
          year: input.year,
          month: input.month,
          contributionBase,
          baseSalary,
          socialSecurityCompany,
          housingFundCompany,
          adjustmentAmount: monthAdjustment,
          notes,
        },
        update: {
          contributionBase,
          baseSalary,
          socialSecurityCompany,
          housingFundCompany,
          adjustmentAmount: monthAdjustment,
          notes,
        },
      });

      // 售前等旧入口仍可能读 dailyRate，当前月保存时刷新缓存
      if (isCurrentMonth) {
        const fixedMonthly = computeMonthlyCost({
          baseSalary,
          socialSecurityCompany,
          housingFundCompany,
        });
        const effectiveMonthly = resolveEffectiveMonthlyCost(
          fixedMonthly,
          monthAdjustment
        );
        const dailyRateCache = resolveDailyRateForMonth(
          effectiveMonthly,
          input.year,
          input.month
        );
        await prisma.personnelProfile.update({
          where: { userId: row.userId },
          data: { dailyRate: dailyRateCache },
        });
      }
    }

    revalidatePath("/personnel");
    revalidatePath("/admin/users");
    revalidatePath("/projects/schedule");
    revalidatePath("/projects");
    revalidatePath("/projects", "layout");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
