import { z } from "zod";

export const amapConfigSchema = z.object({
  webServiceKey: z.string().optional(),
  jsKey: z.string().optional(),
});

export type AmapConfigInput = z.infer<typeof amapConfigSchema>;
