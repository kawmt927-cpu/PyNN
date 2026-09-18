import { getEffectiveAiAgentConfig } from "@/lib/agent/config";
import { createMoonshotFetch, getKimiModelStreamSettings } from "@/lib/agent/moonshot-fetch";
import { extractJsonFromModel } from "@/lib/customers/kimi-client";
import type { PersonnelHrDocumentKind } from "@prisma/client";

export type HrDocumentOcrResult = {
  title: string | null;
  idNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  isLongTerm: boolean;
  confidence: "high" | "medium" | "low";
  rawSummary: string | null;
};

const ID_CARD_SYSTEM = `你是中国居民身份证识别助手。根据用户提供的证件图片或从 PDF 抽取的文本，提取结构化字段。
只输出 JSON，不要 Markdown。字段：
- title: string|null 固定填「身份证」，无法确认则 null
- idNumber: string|null 公民身份号码（18 位）
- issuedAt: string|null 有效期起始日，格式 YYYY-MM-DD
- expiresAt: string|null 有效期截止日，格式 YYYY-MM-DD；若为「长期」则填 null，并 isLongTerm=true
- isLongTerm: boolean 有效期为长期则为 true
- confidence: "high"|"medium"|"low"
- rawSummary: string|null 一句话说明识别依据
无法辨认的字段填 null。不要编造。`;

const CERT_SYSTEM = `你是中国职业/技能/职称证书识别助手。根据用户提供的证书图片或从 PDF 抽取的文本，提取结构化字段。
只输出 JSON，不要 Markdown。字段：
- title: string|null 证书名称（如「一级建造师」），不要含姓名
- idNumber: string|null 证书编号（若有）
- issuedAt: string|null 发证/颁发日期，格式 YYYY-MM-DD
- expiresAt: string|null 有效期截止日，格式 YYYY-MM-DD；若长期有效则填 null，并 isLongTerm=true
- isLongTerm: boolean
- confidence: "high"|"medium"|"low"
- rawSummary: string|null 一句话说明识别依据
无法辨认的字段填 null。不要编造。`;

function mimeToDataUrl(mimeType: string, bytes: Buffer): string {
  const mime = mimeType || "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function isPdf(mimeType: string, fileName?: string) {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  return mime === "application/pdf" || name.endsWith(".pdf");
}

function isImage(mimeType: string) {
  return (mimeType || "").toLowerCase().startsWith("image/");
}

export function assertHrDocumentOcrSupported(mimeType: string, fileName?: string) {
  if (isImage(mimeType) || isPdf(mimeType, fileName)) return;
  throw new Error("AI 识别仅支持图片（JPG/PNG/WEBP 等）或 PDF");
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function normalizeResult(raw: unknown): HrDocumentOcrResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
  };
  const confidenceRaw = str(obj.confidence);
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";
  const isLongTerm = obj.isLongTerm === true || str(obj.expiresAt) === "长期";
  return {
    title: str(obj.title),
    idNumber: str(obj.idNumber)?.replace(/\s/g, "") ?? null,
    issuedAt: normalizeDate(str(obj.issuedAt)),
    expiresAt: isLongTerm ? null : normalizeDate(str(obj.expiresAt)),
    isLongTerm,
    confidence,
    rawSummary: str(obj.rawSummary),
  };
}

async function requireAiConfig() {
  const config = await getEffectiveAiAgentConfig();
  if (!config.apiKey) {
    throw new Error("未配置 AI API Key，请管理员在系统配置 → AI 助手中设置");
  }
  if (!config.enabled) {
    throw new Error("AI 助手未启用，请管理员在系统配置中开启");
  }
  return config;
}

async function callChatJson(input: {
  config: Awaited<ReturnType<typeof requireAiConfig>>;
  messages: Array<Record<string, unknown>>;
}): Promise<HrDocumentOcrResult> {
  const fetchImpl = createMoonshotFetch({
    disableThinking: !input.config.thinkingEnabled,
    model: input.config.model,
  });

  const body: Record<string, unknown> = {
    model: input.config.model,
    messages: input.messages,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    ...getKimiModelStreamSettings(input.config.model),
  };
  if (!input.config.thinkingEnabled) {
    body.thinking = { type: "disabled" };
  }

  const res = await fetchImpl(`${input.config.apiBase.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`证件识别失败 (${res.status}): ${errText.slice(0, 240)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 未返回识别结果");
  return normalizeResult(extractJsonFromModel(content));
}

async function extractPdfTextViaMoonshot(input: {
  apiBase: string;
  apiKey: string;
  bytes: Buffer;
  fileName?: string;
  mimeType: string;
}): Promise<string> {
  const base = input.apiBase.replace(/\/$/, "");
  const form = new FormData();
  form.append("purpose", "file-extract");
  form.append(
    "file",
    new Blob([new Uint8Array(input.bytes)], { type: input.mimeType || "application/pdf" }),
    input.fileName?.trim() || "document.pdf"
  );

  const uploadRes = await fetch(`${base}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`PDF 上传失败 (${uploadRes.status}): ${errText.slice(0, 200)}`);
  }

  const uploaded = (await uploadRes.json()) as { id?: string };
  if (!uploaded.id) throw new Error("PDF 上传成功但未返回 file_id");

  try {
    const contentRes = await fetch(`${base}/files/${uploaded.id}/content`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    if (!contentRes.ok) {
      const errText = await contentRes.text();
      throw new Error(`PDF 内容抽取失败 (${contentRes.status}): ${errText.slice(0, 200)}`);
    }
    const text = (await contentRes.text()).trim();
    if (!text) throw new Error("PDF 未能抽取出可用文本，请改用图片识别");
    return text;
  } finally {
    void fetch(`${base}/files/${uploaded.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${input.apiKey}` },
    }).catch(() => undefined);
  }
}

export async function extractHrDocumentFieldsFromFile(input: {
  kind: PersonnelHrDocumentKind;
  bytes: Buffer;
  mimeType: string;
  fileName?: string;
}): Promise<HrDocumentOcrResult> {
  if (input.kind !== "ID_CARD" && input.kind !== "CERTIFICATE") {
    throw new Error("仅身份证与证书支持自动识别到期日");
  }
  assertHrDocumentOcrSupported(input.mimeType, input.fileName);
  const config = await requireAiConfig();
  const system = input.kind === "ID_CARD" ? ID_CARD_SYSTEM : CERT_SYSTEM;
  const label = input.fileName ? `（文件名：${input.fileName}）` : "";
  const task =
    input.kind === "ID_CARD"
      ? "请提取身份证号码与有效期限"
      : "请提取证书名称、编号与有效期/发证日期";

  if (isPdf(input.mimeType, input.fileName)) {
    const pdfText = await extractPdfTextViaMoonshot({
      apiBase: config.apiBase,
      apiKey: config.apiKey!,
      bytes: input.bytes,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    return callChatJson({
      config,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `以下是从证件 PDF 抽取的文本${label}，${task}，输出 JSON。\n\n----- PDF 文本开始 -----\n${pdfText.slice(0, 120000)}\n----- PDF 文本结束 -----`,
        },
      ],
    });
  }

  const dataUrl = mimeToDataUrl(input.mimeType, input.bytes);
  return callChatJson({
    config,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: `请识别这份证件${label}，${task}。输出 JSON。` },
        ],
      },
    ],
  });
}
