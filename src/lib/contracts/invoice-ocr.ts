import { getEffectiveAiAgentConfig } from "@/lib/agent/config";
import { createMoonshotFetch, getKimiModelStreamSettings } from "@/lib/agent/moonshot-fetch";
import { extractJsonFromModel } from "@/lib/customers/kimi-client";

export type InvoiceOcrResult = {
  amount: number | null;
  taxRatePercent: number | null;
  invoiceNo: string | null;
  invoicedAt: string | null;
  sellerName: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
  rawSummary: string | null;
  /** 发票内容是否与所选费用类别相符 */
  categoryMatch: boolean | null;
  /** 模型判断的实际类别简述 */
  categoryGuess: string | null;
};

const SYSTEM = `你是中国增值税发票识别助手。根据用户提供的发票图片或从 PDF 抽取的文本，提取结构化字段。
只输出 JSON，不要 Markdown。字段：
- amount: number|null 价税合计金额（元）
- taxRatePercent: number|null 税率「几个点」，如 6 表示 6%；若票面是 6% 则填 6
- invoiceNo: string|null 发票号码（优先号码，不是代码）
- invoicedAt: string|null 开票日期，格式 YYYY-MM-DD
- sellerName: string|null 销售方名称
- notes: string|null 可简述购买方或备注，一两句内
- confidence: "high"|"medium"|"low"
- rawSummary: string|null 一句话说明识别依据
- categoryMatch: boolean|null 若用户提供了「期望费用类别」，判断票面内容是否属于该类（是 true / 否 false / 无法判断 null）
- categoryGuess: string|null 根据票面判断更可能属于哪类费用（如飞机票、住宿、餐饮等），简短中文
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

export function assertInvoiceOcrSupported(mimeType: string, fileName?: string) {
  if (isImage(mimeType) || isPdf(mimeType, fileName)) return;
  throw new Error("AI 识别仅支持发票图片（JPG/PNG/WEBP 等）或 PDF");
}

function normalizeResult(raw: unknown): InvoiceOcrResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").replace(/%/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
  };
  let tax = num(obj.taxRatePercent);
  // 若模型返回 0.06，转换为 6 个点
  if (tax != null && tax > 0 && tax < 1) tax = Number((tax * 100).toFixed(2));
  const confidenceRaw = str(obj.confidence);
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  let invoicedAt = str(obj.invoicedAt);
  if (invoicedAt) {
    const m = invoicedAt.match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
    if (m) {
      invoicedAt = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(invoicedAt)) {
      invoicedAt = null;
    }
  }

  let categoryMatch: boolean | null = null;
  if (typeof obj.categoryMatch === "boolean") {
    categoryMatch = obj.categoryMatch;
  } else if (obj.categoryMatch === "true" || obj.categoryMatch === "yes") {
    categoryMatch = true;
  } else if (obj.categoryMatch === "false" || obj.categoryMatch === "no") {
    categoryMatch = false;
  }

  return {
    amount: num(obj.amount),
    taxRatePercent: tax,
    invoiceNo: str(obj.invoiceNo),
    invoicedAt,
    sellerName: str(obj.sellerName),
    notes: str(obj.notes),
    confidence,
    rawSummary: str(obj.rawSummary),
    categoryMatch,
    categoryGuess: str(obj.categoryGuess),
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
}) {
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
    throw new Error(`发票识别失败 (${res.status}): ${errText.slice(0, 240)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 未返回识别结果");
  return normalizeResult(extractJsonFromModel(content));
}

/** 通过 Moonshot files API 抽取 PDF 文本（官方 file-extract） */
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
    input.fileName?.trim() || "invoice.pdf"
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
    if (!text) throw new Error("PDF 未能抽取出可用文本，请改用发票图片识别");
    return text;
  } finally {
    // 尽力清理远端临时文件，失败不影响主流程
    void fetch(`${base}/files/${uploaded.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${input.apiKey}` },
    }).catch(() => undefined);
  }
}

/** 用当前 AI 配置识别发票图片或 PDF */
export async function extractInvoiceFieldsFromFile(input: {
  bytes: Buffer;
  mimeType: string;
  fileName?: string;
  /** 用户所选费用类别标签，用于校验票面是否相符 */
  expectedCategoryLabel?: string | null;
}): Promise<InvoiceOcrResult> {
  assertInvoiceOcrSupported(input.mimeType, input.fileName);
  const config = await requireAiConfig();
  const label = input.fileName ? `（文件名：${input.fileName}）` : "";
  const expectedHint = input.expectedCategoryLabel?.trim()
    ? `\n期望费用类别：「${input.expectedCategoryLabel.trim()}」。请根据票面内容判断是否属于该类，填写 categoryMatch 与 categoryGuess。`
    : "\n未指定期望类别时，categoryMatch 填 null，仍可填写 categoryGuess。";

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
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `以下是从发票 PDF 抽取的文本${label}，请提取价税合计、税率（几个点）、发票号码、开票日期，输出 JSON。${expectedHint}\n\n----- PDF 文本开始 -----\n${pdfText.slice(0, 120000)}\n----- PDF 文本结束 -----`,
        },
      ],
    });
  }

  const dataUrl = mimeToDataUrl(input.mimeType, input.bytes);
  return callChatJson({
    config,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
          {
            type: "text",
            text: `请识别这张发票${label}，提取价税合计、税率（几个点）、发票号码、开票日期。输出 JSON。${expectedHint}`,
          },
        ],
      },
    ],
  });
}

/** @deprecated 使用 extractInvoiceFieldsFromFile */
export async function extractInvoiceFieldsFromImage(input: {
  bytes: Buffer;
  mimeType: string;
  fileName?: string;
}): Promise<InvoiceOcrResult> {
  return extractInvoiceFieldsFromFile(input);
}
