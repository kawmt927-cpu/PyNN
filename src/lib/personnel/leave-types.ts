import { prisma } from "@/lib/prisma";

export const DEFAULT_LEAVE_TYPES = [
  {
    key: "personal",
    label: "事假",
    payFactor: 0,
    countsAsAbsence: true,
    exemptDailyReport: true,
    sortOrder: 10,
  },
  {
    key: "sick",
    label: "病假",
    payFactor: 0.3,
    countsAsAbsence: true,
    exemptDailyReport: true,
    sortOrder: 20,
  },
  {
    key: "annual",
    label: "年假",
    payFactor: 1,
    countsAsAbsence: true,
    exemptDailyReport: true,
    sortOrder: 30,
  },
  {
    key: "compensatory",
    label: "调休",
    payFactor: 1,
    countsAsAbsence: true,
    exemptDailyReport: true,
    sortOrder: 40,
  },
] as const;

/** 确保默认假种存在（幂等） */
export async function ensureDefaultLeaveTypes() {
  for (const row of DEFAULT_LEAVE_TYPES) {
    await prisma.personnelLeaveType.upsert({
      where: { key: row.key },
      create: { ...row, enabled: true },
      update: {},
    });
  }
}

export async function listEnabledLeaveTypes() {
  await ensureDefaultLeaveTypes();
  return prisma.personnelLeaveType.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function listAllLeaveTypes() {
  await ensureDefaultLeaveTypes();
  return prisma.personnelLeaveType.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

function normalizeLeaveKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function upsertLeaveType(input: {
  id?: string | null;
  key?: string | null;
  label: string;
  payFactor: number;
  countsAsAbsence: boolean;
  exemptDailyReport: boolean;
  enabled: boolean;
  sortOrder: number;
}) {
  const label = input.label.trim();
  if (!label) throw new Error("请填写假种名称");
  const payFactor = Number(input.payFactor);
  if (!Number.isFinite(payFactor) || payFactor < 0 || payFactor > 1) {
    throw new Error("计薪系数须在 0～1 之间（如 0.3 表示发 30%）");
  }
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0;

  if (input.id) {
    return prisma.personnelLeaveType.update({
      where: { id: input.id },
      data: {
        label,
        payFactor,
        countsAsAbsence: input.countsAsAbsence,
        exemptDailyReport: input.exemptDailyReport,
        enabled: input.enabled,
        sortOrder,
      },
    });
  }

  const key = normalizeLeaveKey(input.key || label);
  if (!key) throw new Error("请填写假种编码（英文/数字/下划线）");
  const existing = await prisma.personnelLeaveType.findUnique({ where: { key } });
  if (existing) throw new Error(`编码「${key}」已存在`);

  return prisma.personnelLeaveType.create({
    data: {
      key,
      label,
      payFactor,
      countsAsAbsence: input.countsAsAbsence,
      exemptDailyReport: input.exemptDailyReport,
      enabled: input.enabled,
      sortOrder,
    },
  });
}
