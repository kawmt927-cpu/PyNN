import { z } from "zod";

export const aiAgentConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().min(1).default("kimi"),
  apiKey: z.string().optional(),
  apiBase: z.string().url("API Base 须为有效 URL"),
  model: z.string().min(1),
  maxSteps: z.number().int().min(1).max(20),
  thinkingEnabled: z.boolean(),
  salesLogSystemPrompt: z.string().optional(),
  toolSearchCustomers: z.boolean(),
  toolSearchOpportunities: z.boolean(),
  toolGetCustomer: z.boolean(),
  toolListFollowUps: z.boolean(),
});

export type AiAgentConfigInput = z.infer<typeof aiAgentConfigSchema>;
