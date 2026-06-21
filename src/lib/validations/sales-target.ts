import { z } from "zod";

const metricFields = {
  salesTarget: z.coerce.number().min(0, "销售额目标不能为负"),
  costTarget: z.coerce.number().min(0, "成本目标不能为负"),
  profitTarget: z.coerce.number().min(0, "毛利目标不能为负"),
  paymentTarget: z.coerce.number().min(0, "回款目标不能为负"),
};

export const salesAnnualTargetFormSchema = z.object({
  userId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  ...metricFields,
});

export const salesMonthlyTargetFormSchema = z.object({
  userId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  ...metricFields,
});
