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
  sttApiKey: string | null;
  sttApiBase: string;
  sttModel: string;
};

export type AiAgentConfigView = Omit<EffectiveAiAgentConfig, "apiKey" | "sttApiKey"> & {
  apiKeyConfigured: boolean;
  apiKeyMask: string;
  sttApiKeyConfigured: boolean;
  sttApiKeyMask: string;
  /** Kimi 对话是否可用（已配置 Key 且已启用） */
  llmReady: boolean;
  /** 浏览器语音识别是否可用 */
  sttReady: boolean;
};

export type SalesLogPromptSettingsView = {
  /** 数据库中的自定义内容，空表示使用内置默认 */
  customPrompt: string;
  /** 实际生效的完整系统提示词 */
  effectivePrompt: string;
  usingDefault: boolean;
  defaultPrompt: string;
};

export async function getSalesLogPromptSettings(): Promise<SalesLogPromptSettingsView> {
  const row = await findAiAgentConfigRow();
  const customPrompt = row?.salesLogSystemPrompt?.trim() ?? "";
  return {
    customPrompt,
    effectivePrompt: customPrompt || SALES_LOG_SYSTEM_PROMPT,
    usingDefault: !customPrompt,
    defaultPrompt: SALES_LOG_SYSTEM_PROMPT,
  };
}

const DEFAULT_API_BASE = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.5";
const DEFAULT_STT_API_BASE = "https://api.siliconflow.cn/v1";
const DEFAULT_STT_MODEL = "FunAudioLLM/SenseVoiceSmall";

export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "未配置";
  if (key.length <= 8) return "已配置（***）";
  return `已配置（${key.slice(0, 4)}***${key.slice(-4)}）`;
}

export async function findAiAgentConfigRow() {
  return prisma.aiAgentConfig.findUnique({ where: { id: "default" } });
}

/** @deprecated 仅保留兼容；读取配置请用 findAiAgentConfigRow */
export async function getAiAgentConfigRow() {
  return findAiAgentConfigRow();
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
  const row = await findAiAgentConfigRow();
  const env = envFallbackConfig();

  const apiKey = row?.apiKey?.trim() || env.apiKey || null;
  const neverConfiguredByAdmin =
    !row || (row.updatedById === null && !row.apiKey?.trim());
  const enabled = ((row?.enabled ?? false) || neverConfiguredByAdmin) && Boolean(apiKey);

  return {
    enabled,
    provider: row?.provider || "kimi",
    apiKey,
    apiBase: row?.apiBase?.trim() || env.apiBase || DEFAULT_API_BASE,
    model: row?.model?.trim() || env.model || DEFAULT_MODEL,
    maxSteps: row?.maxSteps ?? 10,
    thinkingEnabled: row?.thinkingEnabled ?? true,
    salesLogSystemPrompt: row?.salesLogSystemPrompt?.trim() || SALES_LOG_SYSTEM_PROMPT,
    toolSearchCustomers: row?.toolSearchCustomers ?? true,
    toolSearchOpportunities: row?.toolSearchOpportunities ?? true,
    toolGetCustomer: row?.toolGetCustomer ?? true,
    toolListFollowUps: row?.toolListFollowUps ?? true,
    sttApiKey: row?.sttApiKey?.trim() || process.env.STT_API_KEY?.trim() || null,
    sttApiBase:
      row?.sttApiBase?.trim() ||
      process.env.STT_API_BASE?.trim() ||
      DEFAULT_STT_API_BASE,
    sttModel:
      row?.sttModel?.trim() || process.env.STT_MODEL?.trim() || DEFAULT_STT_MODEL,
  };
}

export async function getAiAgentConfigForAdmin(): Promise<AiAgentConfigView> {
  const row = await findAiAgentConfigRow();
  const effective = await getEffectiveAiAgentConfig();

  return {
    enabled: row?.enabled ?? effective.enabled,
    provider: row?.provider ?? effective.provider,
    apiBase: row?.apiBase ?? effective.apiBase,
    model: row?.model ?? effective.model,
    maxSteps: row?.maxSteps ?? effective.maxSteps,
    thinkingEnabled: row?.thinkingEnabled ?? effective.thinkingEnabled,
    salesLogSystemPrompt: row?.salesLogSystemPrompt?.trim() ?? "",
    toolSearchCustomers: row?.toolSearchCustomers ?? effective.toolSearchCustomers,
    toolSearchOpportunities: row?.toolSearchOpportunities ?? effective.toolSearchOpportunities,
    toolGetCustomer: row?.toolGetCustomer ?? effective.toolGetCustomer,
    toolListFollowUps: row?.toolListFollowUps ?? effective.toolListFollowUps,
    sttApiBase: row?.sttApiBase ?? effective.sttApiBase,
    sttModel: row?.sttModel ?? effective.sttModel,
    apiKeyConfigured: Boolean(row?.apiKey?.trim() || process.env.LLM_API_KEY?.trim()),
    apiKeyMask: maskApiKey(row?.apiKey?.trim() || process.env.LLM_API_KEY?.trim() || null),
    sttApiKeyConfigured: Boolean(
      row?.sttApiKey?.trim() || process.env.STT_API_KEY?.trim()
    ),
    sttApiKeyMask: maskApiKey(
      row?.sttApiKey?.trim() || process.env.STT_API_KEY?.trim() || null
    ),
    llmReady: Boolean(effective.apiKey) && (row?.enabled ?? effective.enabled),
    sttReady: Boolean(effective.sttApiKey),
  };
}
