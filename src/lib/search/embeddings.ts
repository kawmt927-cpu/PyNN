import { createHash } from "crypto";
import { getEffectiveAiAgentConfig } from "@/lib/agent/config";

const SILICONFLOW_EMBED_BASE = "https://api.siliconflow.cn/v1";
const SILICONFLOW_EMBED_MODEL = "BAAI/bge-m3";
const MOONSHOT_EMBED_BASE = "https://api.moonshot.cn/v1";
const MOONSHOT_EMBED_MODEL = "moonshot-v3-embedding";

/** 单条正文送 embedding 的上限（字符）；bge-m3 约 8k tokens */
export const EMBEDDING_TEXT_MAX_CHARS = 6_000;

export type EmbeddingProviderConfig = {
  apiKey: string;
  apiBase: string;
  model: string;
};

/**
 * Embedding 优先走硅基流动（STT 同 Key），因 Moonshot embeddings 常未对账号开放。
 * 可用 EMBEDDING_* 环境变量覆盖。
 */
export async function getEmbeddingProviderConfig(): Promise<EmbeddingProviderConfig | null> {
  const cfg = await getEffectiveAiAgentConfig();
  const envKey = process.env.EMBEDDING_API_KEY?.trim() || null;
  const envBase = process.env.EMBEDDING_API_BASE?.trim() || null;
  const envModel = process.env.EMBEDDING_MODEL?.trim() || null;

  const sttKey = cfg.sttApiKey?.trim() || process.env.STT_API_KEY?.trim() || null;
  const llmKey = cfg.apiKey?.trim() || null;

  if (envKey || envBase || envModel) {
    const apiKey = envKey || sttKey || llmKey;
    if (!apiKey) return null;
    return {
      apiKey,
      apiBase: (envBase || SILICONFLOW_EMBED_BASE).replace(/\/$/, ""),
      model: envModel || SILICONFLOW_EMBED_MODEL,
    };
  }

  if (sttKey) {
    return {
      apiKey: sttKey,
      apiBase: (cfg.sttApiBase?.trim() || SILICONFLOW_EMBED_BASE).replace(/\/$/, ""),
      model: SILICONFLOW_EMBED_MODEL,
    };
  }

  // 回退：尝试 Moonshot（部分账号未开放 embeddings）
  if (llmKey) {
    return {
      apiKey: llmKey,
      apiBase: (cfg.apiBase?.trim() || MOONSHOT_EMBED_BASE).replace(/\/$/, ""),
      model: MOONSHOT_EMBED_MODEL,
    };
  }

  return null;
}

export const DEFAULT_EMBEDDING_MODEL = SILICONFLOW_EMBED_MODEL;

export function hashEmbeddingContent(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function truncateForEmbedding(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= EMBEDDING_TEXT_MAX_CHARS) return t;
  return t.slice(0, EMBEDDING_TEXT_MAX_CHARS);
}

export function parseVectorJson(raw: string): number[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== "number")) {
    throw new Error("向量数据损坏");
  }
  return parsed as number[];
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

type EmbeddingsApiResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
};

/** OpenAI 兼容 /embeddings；支持批量（硅基流动单次最多约 32 条） */
export async function createEmbeddings(
  inputs: string[],
  provider?: EmbeddingProviderConfig | null
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const cfg = provider ?? (await getEmbeddingProviderConfig());
  if (!cfg) {
    throw new Error(
      "未配置 Embedding API Key（可用 STT_API_KEY / EMBEDDING_API_KEY / LLM_API_KEY）"
    );
  }

  const res = await fetch(`${cfg.apiBase}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      input: inputs.length === 1 ? inputs[0] : inputs,
      encoding_format: "float",
    }),
  });

  const json = (await res.json().catch(() => ({}))) as EmbeddingsApiResponse;
  if (!res.ok) {
    throw new Error(
      json.error?.message || `Embedding API 失败 HTTP ${res.status}`
    );
  }
  const rows = [...(json.data ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  if (rows.length !== inputs.length) {
    throw new Error(`Embedding 返回条数不匹配（${rows.length}/${inputs.length}）`);
  }
  return rows.map((row, i) => {
    const emb = row.embedding;
    if (!emb?.length) throw new Error(`第 ${i + 1} 条无向量`);
    return emb;
  });
}

export async function createEmbedding(text: string) {
  const [vec] = await createEmbeddings([text]);
  return vec!;
}
