import { getWeComConfig, isWeComConfigured } from "@/lib/wecom/config";
import { getAccessToken } from "@/lib/wecom/api";

const QYAPI = "https://qyapi.weixin.qq.com/cgi-bin";
/** 对外消息链接固定用域名，避免企微/微信拦截 IP 确认页 */
const PUBLIC_MESSAGE_ORIGIN = "https://crm.pynntech.com";

function truncateText(text: string, maxChars: number) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

/** 去掉用户内容里可能混入的 HTML，避免卡片里露出标签 */
function stripHtmlTags(text: string) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeWeComHtml(text: string) {
  return stripHtmlTags(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 企微 textcard description 按 UTF-8 字节计，上限约 512 */
function utf8ByteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

function truncateToUtf8Bytes(text: string, maxBytes: number) {
  const encoder = new TextEncoder();
  let out = "";
  for (const ch of text) {
    const next = out + ch;
    if (encoder.encode(next).length > maxBytes) break;
    out = next;
  }
  return out;
}

function weComDiv(className: "gray" | "normal" | "highlight", innerHtml: string) {
  return `<div class="${className}">${innerHtml}</div>`;
}

function looksLikeIpHost(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

/**
 * 消息卡片外链基址：始终避开 IP。
 * 优先正式域名常量，再试 PUBLIC_APP_URL / 非 IP 的 NEXTAUTH_URL。
 * （企微/微信点开 IP 链接会出「请使用域名访问」拦截页）
 */
export function publicAppBaseUrl() {
  const candidates = [
    PUBLIC_MESSAGE_ORIGIN,
    process.env.PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ];
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (looksLikeIpHost(url.hostname)) continue;
      return url.origin;
    } catch {
      // ignore invalid
    }
  }
  return PUBLIC_MESSAGE_ORIGIN;
}

export function absoluteAppUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      if (!looksLikeIpHost(url.hostname)) return url.toString();
      return `${publicAppBaseUrl()}${url.pathname}${url.search}${url.hash}`;
    } catch {
      // fall through
    }
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${publicAppBaseUrl()}${normalized}`;
}

/**
 * 规范化 returnTo：只保留站内路径。
 * 若误传入完整 URL（含 IP），剥成 pathname+search，避免二次包装或落到 IP。
 */
export function normalizeReturnToPath(returnToPath: string) {
  const raw = returnToPath.trim();
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      const path = `${url.pathname}${url.search}${url.hash}` || "/";
      return path.startsWith("/") ? path : `/${path}`;
    } catch {
      return "/";
    }
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/** 点击后走企微 OAuth，静默换票登录再落到业务页 */
export function wecomAutoLoginUrl(returnToPath: string) {
  const path = normalizeReturnToPath(returnToPath);
  // 已是 OAuth 入口时不再套一层，避免 returnTo 嵌套
  if (path.startsWith("/api/auth/wecom")) {
    return absoluteAppUrl(path);
  }
  // 勿对整段 path 再 encode：URLSearchParams 会编码 ?&#，
  // 若 path 里已有 %3A 等会变成 %253A，微信端可能校验失败
  const params = new URLSearchParams();
  params.set("returnTo", path);
  return absoluteAppUrl(`/api/auth/wecom?${params.toString()}`);
}

export type WeComHorizontalField = {
  keyname: string;
  value: string;
};

async function postWeComMessage(body: Record<string, unknown>): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isWeComConfigured()) {
    return { ok: false, error: "企业微信未配置" };
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(`${QYAPI}/message/send?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      errcode?: number;
      errmsg?: string;
      invaliduser?: string;
    };
    if (data.errcode && data.errcode !== 0) {
      console.error("[wecom-message]", data.errcode, data.errmsg, data.invaliduser);
      return { ok: false, error: data.errmsg ?? String(data.errcode) };
    }
    return { ok: true };
  } catch (error) {
    console.error("[wecom-message] send failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "发送失败",
    };
  }
}

function buildTextCardDescription(input: {
  subtitle?: string;
  quoteTitle?: string;
  quoteText?: string;
  fields?: WeComHorizontalField[];
}) {
  // 绝不对整段 HTML 做 mid-tag 截断，否则会露出裸的 <div ...>
  const maxBytes = 500;
  const blocks: string[] = [];

  const tryPush = (block: string) => {
    const next = blocks.join("") + block;
    if (utf8ByteLength(next) <= maxBytes) {
      blocks.push(block);
      return true;
    }
    return false;
  };

  if (input.subtitle?.trim()) {
    tryPush(weComDiv("gray", escapeWeComHtml(truncateText(input.subtitle, 60))));
  }

  for (const field of (input.fields ?? []).slice(0, 6)) {
    if (!field.keyname.trim() || !field.value.trim()) continue;
    const line = `${truncateText(field.keyname, 8)}：${truncateText(field.value, 36)}`;
    if (!tryPush(weComDiv("normal", escapeWeComHtml(line)))) break;
  }

  if (input.quoteText?.trim()) {
    const title = input.quoteTitle?.trim() ? `${input.quoteTitle.trim()}：` : "";
    const used = utf8ByteLength(blocks.join(""));
    const wrapperOverhead = utf8ByteLength(weComDiv("highlight", ""));
    const remain = Math.max(24, maxBytes - used - wrapperOverhead);
    const raw = truncateText(`${title}${input.quoteText}`, 100);
    const fitted = truncateToUtf8Bytes(escapeWeComHtml(raw), remain);
    if (fitted) tryPush(weComDiv("highlight", fitted));
  }

  if (blocks.length === 0) {
    return weComDiv("normal", "点击查看详情");
  }
  return blocks.join("");
}

/**
 * 发送应用消息。
 * 使用 textcard（文本卡片）：企业微信与微信插件均可点击跳转。
 * template_card 在微信里只会显示「请在企业微信中查看」，且常落到缓存的旧主页（曾是 IP）。
 */
export async function sendWeComTextNoticeCard(input: {
  wecomUserIds: string[];
  title: string;
  /** 主标题下的一句说明 */
  subtitle?: string;
  /** 更长正文预览（引用区） */
  quoteTitle?: string;
  quoteText?: string;
  fields?: WeComHorizontalField[];
  /** 业务落地页路径；实际跳转会经 OAuth 自动登录 */
  url: string;
  sourceDesc?: string;
  btnText?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const touser = [...new Set(input.wecomUserIds.map((id) => id.trim()).filter(Boolean))];
  if (touser.length === 0) {
    return { ok: false, error: "无有效企微 userid" };
  }

  const { agentId } = getWeComConfig();
  const jumpUrl = wecomAutoLoginUrl(input.url);
  if (looksLikeIpHost(new URL(jumpUrl).hostname)) {
    console.error("[wecom-message] refused IP jumpUrl", jumpUrl);
    return { ok: false, error: "消息链接不能使用 IP，请配置 PUBLIC_APP_URL" };
  }
  console.info("[wecom-message] textcard jumpUrl", jumpUrl);

  return postWeComMessage({
    touser: touser.join("|"),
    msgtype: "textcard",
    agentid: agentId,
    textcard: {
      title: truncateText(input.title, 128),
      description: buildTextCardDescription(input),
      url: jumpUrl,
      btntxt: truncateText(input.btnText ?? "详情", 4),
    },
    enable_id_trans: 0,
    enable_duplicate_check: 1,
    duplicate_check_interval: 180,
  });
}

/**
 * 兼容旧调用：转为文本卡片发送。
 */
export async function sendWeComTextCard(input: {
  wecomUserIds: string[];
  title: string;
  description: string;
  url: string;
  btnText?: string;
}): Promise<{ ok: boolean; error?: string }> {
  return sendWeComTextNoticeCard({
    wecomUserIds: input.wecomUserIds,
    title: input.title,
    subtitle: input.description,
    url: input.url,
    btnText: input.btnText,
  });
}
