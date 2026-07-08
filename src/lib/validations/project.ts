import { z } from "zod";

export const PROJECT_TABS = [
  { id: "overview", label: "概览" },
  { id: "phases", label: "阶段" },
  { id: "schedule", label: "资源排班" },
  { id: "costs", label: "发生费用" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["id"];

export function parseProjectTab(value: string | undefined): ProjectTab {
  if (value === "phases") return "phases";
  if (value === "schedule") return "schedule";
  if (value === "costs") return "costs";
  return "overview";
}

const phaseStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "BLOCKED",
] as const);

const projectStatusSchema = z.enum([
  "PENDING_START",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
  "CLOSED",
] as const);

export const projectOverviewSchema = z.object({
  status: projectStatusSchema,
  progressPercent: z.coerce.number().int().min(0).max(100),
  plannedStartAt: z.string().optional(),
  plannedEndAt: z.string().optional(),
  actualStartAt: z.string().optional(),
  actualEndAt: z.string().optional(),
  notes: z.string().optional(),
});

export const projectPhaseSchema = z.object({
  name: z.string().trim().min(1, "阶段名称不能为空"),
  sortOrder: z.coerce.number().int().min(0),
  parallelGroup: z.coerce.number().int().optional(),
  status: phaseStatusSchema,
  plannedAt: z.string().optional(),
  completedAt: z.string().optional(),
  sourceProduct: z.string().optional(),
});

export const allocationModeSchema = z.enum(["AUTO", "MANUAL"] as const);

export const projectAllocationSchema = z
  .object({
    userId: z.string().min(1),
    phaseId: z.string().optional(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    allocationMode: allocationModeSchema.default("AUTO"),
    plannedDays: z.coerce.number().positive().optional(),
    splitWeight: z.coerce.number().positive().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.allocationMode === "MANUAL" && data.plannedDays == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "手动模式须填写总人天",
        path: ["plannedDays"],
      });
    }
  });

export function parseOptionalDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseDateOnlyInput(value: string | undefined): Date {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error("日期不能为空");
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!y || !m || !d) throw new Error("日期格式无效");
  return new Date(y, m - 1, d);
}
