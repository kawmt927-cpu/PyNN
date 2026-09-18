import { prisma } from "@/lib/prisma";
import {
  eachDayKeyInclusive,
  listCompanyAttendanceDayKeys,
} from "@/lib/calendar/company-attendance";
import { ensureDefaultLeaveTypes } from "@/lib/personnel/leave-types";
import { toDayKeyLocal } from "@/lib/calendar/cn-daily-report-days";

/**
 * 某日是否有「免日报」的生效请假。
 * 同日若有 manual 与 wecom：仅看最终生效日——若存在任意 active 且 exempt 的日记录即免考；
 * 写入时保证 manual 优先（wecom 日若撞 manual 则不建或取消）。
 */
export async function hasExemptDailyReportLeave(
  userId: string,
  dayKey: string
): Promise<boolean> {
  const row = await prisma.personnelLeaveDay.findFirst({
    where: {
      userId,
      dayKey,
      status: "active",
      exemptDailyReport: true,
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function listAbsenceDayKeysForUserMonth(
  userId: string,
  year: number,
  month: number
): Promise<string[]> {
  const companyKeys = await listCompanyAttendanceDayKeys(year, month);
  if (companyKeys.length === 0) return [];
  const rows = await prisma.personnelLeaveDay.findMany({
    where: {
      userId,
      status: "active",
      countsAsAbsence: true,
      dayKey: { in: companyKeys },
    },
    select: { dayKey: true },
  });
  return [...new Set(rows.map((r) => r.dayKey))];
}

export async function countPersonalAttendanceDays(
  userId: string,
  year: number,
  month: number
): Promise<{
  companyDays: number;
  absenceDays: number;
  attendanceDays: number;
}> {
  const companyKeys = await listCompanyAttendanceDayKeys(year, month);
  const absenceKeys = await listAbsenceDayKeysForUserMonth(userId, year, month);
  const absenceSet = new Set(absenceKeys);
  const attendanceDays = companyKeys.filter((k) => !absenceSet.has(k)).length;
  return {
    companyDays: companyKeys.length,
    absenceDays: absenceKeys.length,
    attendanceDays,
  };
}

export async function createManualLeave(input: {
  userId: string;
  leaveTypeId: string;
  startDayKey: string;
  endDayKey: string;
  note?: string | null;
  createdById: string;
}) {
  await ensureDefaultLeaveTypes();
  const leaveType = await prisma.personnelLeaveType.findFirst({
    where: { id: input.leaveTypeId, enabled: true },
  });
  if (!leaveType) throw new Error("无效假种");
  if (input.startDayKey > input.endDayKey) {
    throw new Error("开始日期不能晚于结束日期");
  }

  const dayKeys = eachDayKeyInclusive(input.startDayKey, input.endDayKey);
  if (dayKeys.length === 0) throw new Error("请假区间无效");

  const leave = await prisma.personnelLeave.create({
    data: {
      userId: input.userId,
      leaveTypeId: leaveType.id,
      source: "manual",
      status: "active",
      startDayKey: input.startDayKey,
      endDayKey: input.endDayKey,
      note: input.note?.trim() || null,
      createdById: input.createdById,
      days: {
        create: dayKeys.map((dayKey) => ({
          userId: input.userId,
          dayKey,
          leaveTypeId: leaveType.id,
          countsAsAbsence: leaveType.countsAsAbsence,
          exemptDailyReport: leaveType.exemptDailyReport,
          source: "manual",
          status: "active",
        })),
      },
    },
    include: { leaveType: true, days: true },
  });

  // 同日 wecom 记录让位给 manual：取消 wecom 日行
  await prisma.personnelLeaveDay.updateMany({
    where: {
      userId: input.userId,
      dayKey: { in: dayKeys },
      source: "wecom",
      status: "active",
      leaveId: { not: leave.id },
    },
    data: { status: "cancelled" },
  });

  return leave;
}

export async function cancelLeave(leaveId: string) {
  await prisma.$transaction([
    prisma.personnelLeave.update({
      where: { id: leaveId },
      data: { status: "cancelled" },
    }),
    prisma.personnelLeaveDay.updateMany({
      where: { leaveId },
      data: { status: "cancelled" },
    }),
  ]);
}

export async function listLeavesForMonth(year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return prisma.personnelLeave.findMany({
    where: {
      status: "active",
      OR: [
        { startDayKey: { startsWith: prefix } },
        { endDayKey: { startsWith: prefix } },
        {
          AND: [
            { startDayKey: { lte: `${prefix}-31` } },
            { endDayKey: { gte: `${prefix}-01` } },
          ],
        },
      ],
    },
    include: {
      user: { select: { id: true, name: true } },
      leaveType: true,
    },
    orderBy: [{ startDayKey: "desc" }, { createdAt: "desc" }],
  });
}

export function todayDayKey() {
  return toDayKeyLocal(new Date());
}
