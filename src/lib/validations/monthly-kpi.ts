import { z } from "zod";

export const monthlyKpiTargetFormSchema = z.object({
  userId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  channelDevTarget: z.coerce.number().int().min(0).optional().nullable(),
  projectDevTarget: z.coerce.number().int().min(0).optional().nullable(),
  paymentCollectionTarget: z.coerce.number().min(0).optional().nullable(),
  maintenanceTarget: z.coerce.number().int().min(0).optional().nullable(),
});

export const kpiConfigFormSchema = z.object({
  projectDevMinStageValue: z.string().optional().nullable(),
});
