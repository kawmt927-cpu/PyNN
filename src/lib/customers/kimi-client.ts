import { getEffectiveAiAgentConfig } from "@/lib/agent/config";
import { createMoonshotFetch, getKimiModelStreamSettings } from "@/lib/agent/moonshot-fetch";

export function extractJsonFromModel(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(raw) as unknown;
}

export async function callKimiJson(input: {
  system: string;
  user: string;
  maxTokens?: number;
}) {
  const config = await getEffectiveAiAgentConfig();
  if (!config.apiKey) {
    throw new Error("未配置 Kimi API Key，请管理员在系统配置 → AI 助手中设置");
  }

  const fetchImpl = createMoonshotFetch({
    disableThinking: !config.thinkingEnabled,
    model: config.model,
  });

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    max_tokens: input.maxTokens ?? 2048,
    response_format: { type: "json_object" },
    ...getKimiModelStreamSettings(config.model),
  };

  if (!config.thinkingEnabled) {
    body.thinking = { type: "disabled" };
  }

  const res = await fetchImpl(`${config.apiBase.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kimi 请求失败 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Kimi 未返回有效内容");

  return extractJsonFromModel(content);
}
