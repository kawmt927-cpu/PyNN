import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getEffectiveAiAgentConfig } from "@/lib/agent/config";
import { createMoonshotFetch, getKimiModelStreamSettings } from "@/lib/agent/moonshot-fetch";
import { createCrmAgentTools, type AgentSession } from "@/lib/agent/tools";
import {
  createManagerAgentTools,
  formatRosterSummaryForPrompt,
  listManagerVisibleRoster,
  type ManagerAgentSession,
} from "@/lib/agent/manager-tools";
import {
  buildManagerAssistantRuntimeContext,
  getManagerBusinessToday,
  MANAGER_ASSISTANT_SYSTEM_PROMPT,
} from "@/lib/agent/manager-prompt";
import { ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  buildSalesLogLoopRecoveryContext,
  sanitizeSalesLogMessagesForAgent,
  toAgentChatMessages,
} from "@/lib/agent/conversation-recovery";
import { buildSalesLogCustomerFieldOptionsContext } from "@/lib/agent/sales-log-prompt";

export type { AgentSession, ManagerAgentSession };

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

  const rawMessages = (Array.isArray(messages) ? messages : []).map((m) => ({
    role: String((m as { role?: string }).role ?? ""),
    content:
      typeof (m as { content?: unknown }).content === "string"
        ? ((m as { content: string }).content as string)
        : Array.isArray((m as { content?: unknown }).content)
          ? ((m as { content: Array<{ type?: string; text?: string }> }).content
              .map((part) => (part?.type === "text" ? part.text ?? "" : ""))
              .join("")
            )
          : "",
  }));

  const prepared = sanitizeSalesLogMessagesForAgent(rawMessages);
  const agentMessages = toAgentChatMessages(prepared.messages);

  const systemParts = [config.salesLogSystemPrompt];
  if (options.todayWorkContext?.trim()) {
    systemParts.push(options.todayWorkContext.trim());
  }
  systemParts.push(await buildSalesLogCustomerFieldOptionsContext());
  if (prepared.loopDetected) {
    systemParts.push(buildSalesLogLoopRecoveryContext(prepared.messages));
    console.info("[sales-log] conversation loop recovery applied", {
      userId: session.user.id,
      collapsedCount: prepared.collapsedCount,
      messageCount: prepared.messages.length,
    });
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

  const tools = await createCrmAgentTools(session, config);

  return streamText({
    model: provider(config.model),
    system: systemParts.join("\n\n"),
    messages: agentMessages,
    tools,
    maxSteps: Math.max(config.maxSteps, 10),
    ...getKimiModelStreamSettings(config.model),
  });
}

export async function createManagerAgentStream(
  messages: Parameters<typeof streamText>[0]["messages"],
  session: ManagerAgentSession
) {
  const config = await getEffectiveAiAgentConfig();

  if (!config.enabled) {
    throw new Error("AI 助手未启用，请联系管理员在系统配置中开启");
  }
  if (!config.apiKey) {
    throw new Error("未配置 Kimi API Key，请在系统配置 → AI 助手中设置");
  }

  const rawMessages = (Array.isArray(messages) ? messages : []).map((m) => ({
    role: String((m as { role?: string }).role ?? ""),
    content:
      typeof (m as { content?: unknown }).content === "string"
        ? ((m as { content: string }).content as string)
        : Array.isArray((m as { content?: unknown }).content)
          ? ((m as { content: Array<{ type?: string; text?: string }> }).content
              .map((part) => (part?.type === "text" ? part.text ?? "" : ""))
              .join("")
            )
          : "",
  }));

  const prepared = sanitizeSalesLogMessagesForAgent(rawMessages);
  const agentMessages = toAgentChatMessages(prepared.messages);

  const [actor, roster] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, role: true },
    }),
    listManagerVisibleRoster(),
  ]);

  const runtimeContext = buildManagerAssistantRuntimeContext({
    actorName: actor?.name ?? session.user.name ?? "当前用户",
    actorRole: `${ROLE_LABELS[session.user.role] ?? session.user.role}（${session.user.role}）`,
    rosterSummary: formatRosterSummaryForPrompt(roster),
    today: getManagerBusinessToday(),
  });

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBase,
    compatibility: "compatible",
    fetch: createMoonshotFetch({
      disableThinking: !config.thinkingEnabled,
      model: config.model,
    }),
  });

  const tools = createManagerAgentTools(session);

  return streamText({
    model: provider(config.model),
    system: `${MANAGER_ASSISTANT_SYSTEM_PROMPT}\n\n${runtimeContext}`,
    messages: agentMessages,
    tools,
    maxSteps: Math.max(config.maxSteps, 12),
    ...getKimiModelStreamSettings(config.model),
  });
}
