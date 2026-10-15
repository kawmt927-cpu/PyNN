"use server";

import { revalidatePath } from "next/cache";
import { PersonnelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { IMPLEMENTATION_LIST_ROLES } from "@/lib/personnel/access";
import {
  computeMonthlyCost,
  isFutureYearMonth,
  resolveDailyRateForMonth,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";
import { materializeMonthCostDraftForUser } from "@/lib/personnel/ensure-month-costs";
import { computeLeaveDeductionPreview } from "@/lib/personnel/leave-pay";
import { ensureDefaultLeaveTypes } from "@/lib/personnel/leave-types";
import {
  appendAttendanceChangeNote,
  buildChangeSummary,
  parseCopiedSnapshot,
  type CostComposition,
} from "@/lib/personnel/cost-change-summary";

function isImplementationListUser(role: string): boolean {
  return (IMPLEMENTATION_LIST_ROLES as string[]).includes(role);
}

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

function parseNonNegMoney(raw: unknown, label: string): number {
  if (raw == null) return 0;
  const text = String(raw).trim();
  if (!text) return 0;
  const value = Number(text);
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`${label}无效`);
  }
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
  bonus: string;
  penaltyAmount: string;
  monthAdjustment: string;
  /** 实际出勤天数（可人工改；空则用系统按请假算出的值） */
  attendanceDays?: string;
  monthAdjustmentNotes?: string;
};

function parseAttendanceDays(raw: unknown, label = "实际出勤天数"): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}无效`);
  }
  return Math.round(value * 100) / 100;
}

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
      const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { role: true, personnelProfile: { select: { userId: true } } },
      });
      if (!user?.personnelProfile || !isImplementationListUser(user.role)) {
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

/** 批量确认保存指定月份的人员成本；确认后才参与项目人力成本核算 */
export async function updatePersonnelCostsBatch(input: {
  year: number;
  month: number;
  rows: PersonnelCostRowInput[];
}): Promise<ActionResult> {
  try {
    await requireRole(["HR", "ADMIN"]);
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
      const bonus = parseNonNegMoney(row.bonus, "奖金");
      const penaltyAmount = parseNonNegMoney(row.penaltyAmount, "扣罚");
      const monthAdjustment = parseAdjustment(row.monthAdjustment);

      const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { role: true, personnelProfile: { select: { userId: true } } },
      });
      if (!user?.personnelProfile || !isImplementationListUser(user.role)) {
        throw new Error("存在非实施人员记录，已中止保存");
      }

      await ensureDefaultLeaveTypes();
      const leavePreview = await computeLeaveDeductionPreview({
        userId: row.userId,
        year: input.year,
        month: input.month,
        baseSalary,
        socialSecurityCompany,
        housingFundCompany,
      });
      const systemAttendanceDays = leavePreview.attendanceDays;
      const attendanceDays =
        parseAttendanceDays(row.attendanceDays) ?? systemAttendanceDays;
      if (attendanceDays <= 0) {
        throw new Error(
          `${row.userId} 在 ${input.year}-${input.month} 实际出勤为 0，无法关账（请检查请假与公司日历，或手工改正出勤天数）`
        );
      }

      const existing = await prisma.personnelMonthlyCostAdjustment.findUnique({
        where: {
          userId_year_month: {
            userId: row.userId,
            year: input.year,
            month: input.month,
          },
        },
        select: { copiedSnapshot: true },
      });

      const composition: CostComposition = {
        contributionBase,
        baseSalary,
        socialSecurityCompany,
        housingFundCompany,
        bonus,
        penaltyAmount,
        monthAdjustment,
      };
      const changeSummary = appendAttendanceChangeNote(
        buildChangeSummary(
          composition,
          parseCopiedSnapshot(existing?.copiedSnapshot)
        ),
        systemAttendanceDays,
        attendanceDays
      );

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
          bonus,
          penaltyAmount,
          adjustmentAmount: monthAdjustment,
          leaveDeductionAmount: leavePreview.leaveDeductionTotal,
          attendanceDays,
          attendanceDaysSystem: systemAttendanceDays,
          notes: null,
          changeSummary,
          confirmedAt: now,
        },
        update: {
          contributionBase,
          baseSalary,
          socialSecurityCompany,
          housingFundCompany,
          bonus,
          penaltyAmount,
          adjustmentAmount: monthAdjustment,
          leaveDeductionAmount: leavePreview.leaveDeductionTotal,
          attendanceDays,
          attendanceDaysSystem: systemAttendanceDays,
          notes: null,
          changeSummary,
          confirmedAt: now,
        },
      });

      // 关账后刷新档案日单价缓存（供旧入口）
      {
        const fixedMonthly = computeMonthlyCost({
          baseSalary,
          socialSecurityCompany,
          housingFundCompany,
        });
        const effectiveMonthly = resolveEffectiveMonthlyCost(
          fixedMonthly,
          monthAdjustment,
          leavePreview.leaveDeductionTotal,
          { bonus, penaltyAmount }
        );
        const dailyRateCache = resolveDailyRateForMonth(
          effectiveMonthly,
          input.year,
          input.month,
          attendanceDays
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

/**
 * 将已离职实施人员手动纳入指定月份成本表（仅本月生效；下月默认仍不出现）。
 */
export async function includeResignedPersonnelInMonthCosts(input: {
  year: number;
  month: number;
  userIds: string[];
}): Promise<ActionResult> {
  try {
    await requireRole(["HR", "ADMIN"]);
    if (!input.year || input.month < 1 || input.month > 12) {
      return { error: "月份无效" };
    }
    if (isFutureYearMonth(input.year, input.month)) {
      return { error: "不能维护尚未到达的月份" };
    }
    const userIds = [...new Set(input.userIds.map((id) => String(id).trim()).filter(Boolean))];
    if (userIds.length === 0) return { error: "请选择要纳入的离职人员" };

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        role: true,
        personnelProfile: { select: { enabled: true } },
      },
    });
    if (users.length !== userIds.length) {
      return { error: "存在无效人员，已中止" };
    }
    for (const user of users) {
      if (!isImplementationListUser(user.role)) {
        return { error: `${user.name} 不是实施人员名单成员` };
      }
      if (user.personnelProfile?.enabled !== false) {
        return { error: `${user.name} 仍为在职，无需手动纳入` };
      }
      await materializeMonthCostDraftForUser({
        userId: user.id,
        year: input.year,
        month: input.month,
        allowEmpty: true,
      });
    }

    revalidatePath("/personnel");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

/**
 * 将已离职人员移出指定月份成本表（仅未确认草稿可删；下月本就不会默认出现）。
 */
export async function excludeResignedPersonnelFromMonthCosts(input: {
  year: number;
  month: number;
  userId: string;
}): Promise<ActionResult> {
  try {
    await requireRole(["HR", "ADMIN"]);
    if (!input.year || input.month < 1 || input.month > 12) {
      return { error: "月份无效" };
    }
    const userId = String(input.userId ?? "").trim();
    if (!userId) return { error: "缺少用户" };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        role: true,
        personnelProfile: { select: { enabled: true } },
      },
    });
    if (!user || !isImplementationListUser(user.role)) {
      return { error: "人员无效" };
    }
    if (user.personnelProfile?.enabled !== false) {
      return { error: "仅可移出离职人员；在职人员请勿移出" };
    }

    const row = await prisma.personnelMonthlyCostAdjustment.findUnique({
      where: {
        userId_year_month: {
          userId,
          year: input.year,
          month: input.month,
        },
      },
      select: { id: true, confirmedAt: true },
    });
    if (!row) return { error: "本月无该人员成本记录" };
    if (row.confirmedAt) {
      return { error: "本月成本已确认，不能移出；如需调整请走编辑保存" };
    }

    await prisma.personnelMonthlyCostAdjustment.delete({ where: { id: row.id } });
    revalidatePath("/personnel");
    return {};
  } catch (error) {
    return formatError(error);
  }
}
