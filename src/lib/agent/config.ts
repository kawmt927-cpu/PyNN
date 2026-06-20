import { prisma } from "@/lib/prisma";
import { SALES_LOG_SYSTEM_PROMPT } from "@/lib/agent/sales-log-prompt";

export type EffectiveAiAgentConfig = {
  enabled: boolean;
  provider: string;
  apiKey: string | null;
  apiBase: string;
  model: string;
  maxSteps: number;
  thinkingEnabled: boolean;
  salesLogSystemPrompt: string;
  toolSearchCustomers: boolean;
  toolSearchOpportunities: boolean;
  toolGetCustomer: boolean;
  toolListFollowUps: boolean;
};

export type AiAgentConfigView = Omit<EffectiveAiAgentConfig, "apiKey"> & {
  apiKeyConfigured: boolean;
  apiKeyMask: string;
};

const DEFAULT_API_BASE = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.5";

export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "未配置";
  if (key.length <= 8) return "已配置（***）";
  return `已配置（${key.slice(0, 4)}***${key.slice(-4)}）`;
}

export async function getAiAgentConfigRow() {
  return prisma.aiAgentConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

function envFallbackConfig(): Partial<EffectiveAiAgentConfig> {
  const apiKey = process.env.LLM_API_KEY?.trim() || null;
  return {
    enabled: Boolean(apiKey),
    apiKey,
    apiBase: process.env.LLM_API_BASE?.trim() || DEFAULT_API_BASE,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export async function getEffectiveAiAgentConfig(): Promise<EffectiveAiAgentConfig> {
  const row = await getAiAgentConfigRow();
  const env = envFallbackConfig();

  const apiKey = row.apiKey?.trim() || env.apiKey || null;
  const neverConfiguredByAdmin = row.updatedById === null && !row.apiKey?.trim();
  const enabled = (row.enabled || neverConfiguredByAdmin) && Boolean(apiKey);

  return {
    enabled,
    provider: row.provider || "kimi",
    apiKey,
    apiBase: row.apiBase?.trim() || env.apiBase || DEFAULT_API_BASE,
    model: row.model?.trim() || env.model || DEFAULT_MODEL,
    maxSteps: row.maxSteps,
    thinkingEnabled: row.thinkingEnabled,
    salesLogSystemPrompt: row.salesLogSystemPrompt?.trim() || SALES_LOG_SYSTEM_PROMPT,
    toolSearchCustomers: row.toolSearchCustomers,
    toolSearchOpportunities: row.toolSearchOpportunities,
    toolGetCustomer: row.toolGetCustomer,
    toolListFollowUps: row.toolListFollowUps,
  };
}

export async function getAiAgentConfigForAdmin(): Promise<AiAgentConfigView> {
  const row = await getAiAgentConfigRow();
  const effective = await getEffectiveAiAgentConfig();

  return {
    enabled: row.enabled,
    provider: row.provider,
    apiBase: row.apiBase,
    model: row.model,
    maxSteps: row.maxSteps,
    thinkingEnabled: row.thinkingEnabled,
    salesLogSystemPrompt: row.salesLogSystemPrompt?.trim() ?? "",
    toolSearchCustomers: row.toolSearchCustomers,
    toolSearchOpportunities: row.toolSearchOpportunities,
    toolGetCustomer: row.toolGetCustomer,
    toolListFollowUps: row.toolListFollowUps,
    apiKeyConfigured: Boolean(row.apiKey?.trim() || process.env.LLM_API_KEY?.trim()),
    apiKeyMask: maskApiKey(row.apiKey?.trim() || process.env.LLM_API_KEY?.trim() || null),
  };
}
