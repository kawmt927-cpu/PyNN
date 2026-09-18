import { prisma } from "@/lib/prisma";
import { listCompanyAttendanceDayKeys } from "@/lib/calendar/company-attendance";
import { computeMonthlyCost, roundMoney } from "@/lib/personnel/daily-rate";
import { countPersonalAttendanceDays } from "@/lib/personnel/leaves";

export type LeaveDeductionLine = {
  dayKey: string;
  leaveTypeKey: string;
  leaveTypeLabel: string;
  payFactor: number;
  deduction: number;
};

/**
 * 参考日薪 = 标准月成本 ÷ 公司出勤日（仅用于请假扣款，非关账日单价）
 */
export async function computeLeaveDeductionPreview(input: {
  userId: string;
  year: number;
  month: number;
  baseSalary?: number | null;
  socialSecurityCompany?: number | null;
  housingFundCompany?: number | null;
}): Promise<{
  companyDays: number;
  absenceDays: number;
  attendanceDays: number;
  standardMonthlyCost: number | null;
  refDaily: number | null;
  leaveDeductionTotal: number;
  lines: LeaveDeductionLine[];
}> {
  const attendance = await countPersonalAttendanceDays(
    input.userId,
    input.year,
    input.month
  );
  const standardMonthlyCost = computeMonthlyCost({
    baseSalary: input.baseSalary,
    socialSecurityCompany: input.socialSecurityCompany,
    housingFundCompany: input.housingFundCompany,
  });

  const companyKeys = await listCompanyAttendanceDayKeys(input.year, input.month);
  const refDaily =
    standardMonthlyCost != null && attendance.companyDays > 0
      ? roundMoney(standardMonthlyCost / attendance.companyDays)
      : null;

  if (refDaily == null || companyKeys.length === 0) {
    return {
      ...attendance,
      standardMonthlyCost,
      refDaily,
      leaveDeductionTotal: 0,
      lines: [],
    };
  }

  const dayRows = await prisma.personnelLeaveDay.findMany({
    where: {
      userId: input.userId,
      status: "active",
      dayKey: { in: companyKeys },
    },
    select: {
      dayKey: true,
      leaveTypeId: true,
    },
  });

  const typeIds = [...new Set(dayRows.map((r) => r.leaveTypeId))];
  const types = await prisma.personnelLeaveType.findMany({
    where: { id: { in: typeIds } },
  });
  const typeById = new Map(types.map((t) => [t.id, t]));

  const bestByDay = new Map<string, { leaveTypeId: string; payFactor: number }>();
  for (const row of dayRows) {
    const t = typeById.get(row.leaveTypeId);
    if (!t) continue;
    const prev = bestByDay.get(row.dayKey);
    if (!prev || t.payFactor < prev.payFactor) {
      bestByDay.set(row.dayKey, {
        leaveTypeId: t.id,
        payFactor: t.payFactor,
      });
    }
  }

  const lines: LeaveDeductionLine[] = [];
  let leaveDeductionTotal = 0;
  for (const [dayKey, best] of bestByDay) {
    const t = typeById.get(best.leaveTypeId)!;
    const factor = Math.min(1, Math.max(0, t.payFactor));
    const deduction = roundMoney(refDaily * (1 - factor));
    if (deduction <= 0) continue;
    leaveDeductionTotal = roundMoney(leaveDeductionTotal + deduction);
    lines.push({
      dayKey,
      leaveTypeKey: t.key,
      leaveTypeLabel: t.label,
      payFactor: factor,
      deduction,
    });
  }
  lines.sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  return {
    ...attendance,
    standardMonthlyCost,
    refDaily,
    leaveDeductionTotal,
    lines,
  };
}

export function resolveEffectiveMonthlyCostWithLeave(input: {
  fixedMonthlyCost: number | null;
  adjustmentAmount?: number | null;
  leaveDeductionAmount?: number | null;
}): number | null {
  if (input.fixedMonthlyCost == null) return null;
  const adjustment =
    input.adjustmentAmount != null && Number.isFinite(input.adjustmentAmount)
      ? input.adjustmentAmount
      : 0;
  const leaveDeduction =
    input.leaveDeductionAmount != null && Number.isFinite(input.leaveDeductionAmount)
      ? Math.max(0, input.leaveDeductionAmount)
      : 0;
  return roundMoney(
    Math.max(0, input.fixedMonthlyCost + adjustment - leaveDeduction)
  );
}

/** 关账二次确认文案：汇总请假扣款与出勤 */
export function formatLeaveCloseConfirmHint(input: {
  year: number;
  month: number;
  companyDays: number;
  rows: Array<{
    name: string;
    leaveDeductionAmount: number;
    attendanceDays: number;
    absenceDays: number;
  }>;
}): string {
  const withDeduction = input.rows.filter((r) => r.leaveDeductionAmount > 0);
  const deductionTotal = roundMoney(
    withDeduction.reduce((sum, r) => sum + r.leaveDeductionAmount, 0)
  );
  const zeroAttendance = input.rows.filter((r) => r.attendanceDays <= 0);
  const lines = [
    `${input.year}年${input.month}月关账将写入请假扣款与实际出勤天数（日单价 = 有效月成本 ÷ 出勤）。`,
    `公司出勤 ${input.companyDays} 天；有请假扣款 ${withDeduction.length} 人，合计 ${deductionTotal.toFixed(2)} 元。`,
  ];
  if (withDeduction.length > 0 && withDeduction.length <= 8) {
    lines.push(
      withDeduction
        .map(
          (r) =>
            `${r.name}：扣 ${r.leaveDeductionAmount.toFixed(2)}（缺勤 ${r.absenceDays} / 出勤 ${r.attendanceDays}）`
        )
        .join("；")
    );
  }
  if (zeroAttendance.length > 0) {
    lines.push(
      `注意：${zeroAttendance.map((r) => r.name).join("、")} 实际出勤为 0，保存将失败。`
    );
  }
  return lines.join("\n");
}
