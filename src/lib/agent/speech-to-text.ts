export type EffectiveSttConfig = {
  apiKey: string;
  apiBase: string;
  model: string;
};

const DEFAULT_STT_API_BASE = "https://api.siliconflow.cn/v1";
const DEFAULT_STT_MODEL = "FunAudioLLM/SenseVoiceSmall";

export async function getEffectiveSttConfig(): Promise<EffectiveSttConfig | null> {
  const { findAiAgentConfigRow } = await import("@/lib/agent/config");
  const row = await findAiAgentConfigRow();

  const apiKey =
    row?.sttApiKey?.trim() || process.env.STT_API_KEY?.trim() || null;
  if (!apiKey) return null;

  return {
    apiKey,
    apiBase:
      row?.sttApiBase?.trim() ||
      process.env.STT_API_BASE?.trim() ||
      DEFAULT_STT_API_BASE,
    model:
      row?.sttModel?.trim() ||
      process.env.STT_MODEL?.trim() ||
      DEFAULT_STT_MODEL,
  };
}

export async function isSttAvailable() {
  const config = await getEffectiveSttConfig();
  return Boolean(config?.apiKey);
}

export async function transcribeAudioBlob(
  audio: Blob,
  filename: string
): Promise<string> {
  const config = await getEffectiveSttConfig();
  if (!config) {
    throw new Error(
      "语音识别未配置，请管理员在系统配置 → AI 助手中设置语音识别 API Key（推荐硅基流动 SenseVoice）"
    );
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", config.model);

  const base = config.apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  let data: { text?: string; error?: { message?: string } | string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error("语音识别服务响应异常");
  }

  if (!res.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || "语音识别失败";
    throw new Error(message);
  }

  const text = data.text?.trim();
  if (!text) {
    throw new Error("未识别到语音内容，请靠近麦克风后重试");
  }

  return text;
}
