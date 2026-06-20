import type { FetchFunction } from "@ai-sdk/provider-utils";

/** Kimi K2 系列默认开启 thinking，OpenAI 兼容层不解析 reasoning_content 会导致空回复 */
export function isKimiThinkingModel(model: string): boolean {
  return /kimi-k2/i.test(model);
}

/** Kimi K2.5 等模型仅允许 temperature=0.6 */
export function getKimiModelStreamSettings(model: string): {
  temperature?: number;
} {
  if (isKimiThinkingModel(model)) {
    return { temperature: 0.6 };
  }
  return {};
}

export function createMoonshotFetch(options: {
  disableThinking: boolean;
  model: string;
}): FetchFunction {
  const shouldInject =
    options.disableThinking && isKimiThinkingModel(options.model);

  if (!shouldInject) {
    return fetch;
  }

  return async (url, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.thinking = { type: "disabled" };
        return fetch(url, { ...init, body: JSON.stringify(body) });
      } catch {
        // 解析失败则原样请求
      }
    }
    return fetch(url, init);
  };
}
