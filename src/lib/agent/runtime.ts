import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getEffectiveAiAgentConfig } from "@/lib/agent/config";
import { createMoonshotFetch, getKimiModelStreamSettings } from "@/lib/agent/moonshot-fetch";
import { createCrmAgentTools, type AgentSession } from "@/lib/agent/tools";

export type { AgentSession };

export async function isAiAgentAvailable() {
  const config = await getEffectiveAiAgentConfig();
  return config.enabled && Boolean(config.apiKey);
}

export type SalesLogAgentOptions = {
  todayWorkContext?: string;
};

export async function createSalesLogAgentStream(
  messages: Parameters<typeof streamText>[0]["messages"],
  session: AgentSession,
  options: SalesLogAgentOptions = {}
) {
  const config = await getEffectiveAiAgentConfig();

  if (!config.enabled) {
    throw new Error("AI 助手未启用，请联系管理员在系统配置中开启");
  }
  if (!config.apiKey) {
    throw new Error("未配置 Kimi API Key，请在系统配置 → AI 助手中设置");
  }

  const systemParts = [config.salesLogSystemPrompt];
  if (options.todayWorkContext?.trim()) {
    systemParts.push(options.todayWorkContext.trim());
  }

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBase,
    compatibility: "compatible",
    fetch: createMoonshotFetch({
      disableThinking: !config.thinkingEnabled,
      model: config.model,
    }),
  });

  const tools = createCrmAgentTools(session, config);

  return streamText({
    model: provider(config.model),
    system: systemParts.join("\n\n"),
    messages,
    tools,
    maxSteps: Math.max(config.maxSteps, 10),
    ...getKimiModelStreamSettings(config.model),
  });
}
