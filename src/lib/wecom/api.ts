import crypto from "crypto";
import { UserRole } from "@prisma/client";
import { getWeComConfig } from "./config";

const QYAPI = "https://qyapi.weixin.qq.com/cgi-bin";

type TokenCache = { token: string; expiresAt: number };
type TicketCache = { ticket: string; expiresAt: number };

let accessTokenCache: TokenCache | null = null;
let jsapiTicketCache: TicketCache | null = null;
let agentTicketCache: TicketCache | null = null;

async function qyFetch<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, { ...init, next: { revalidate: 0 } });
  const data = (await res.json()) as T & { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`企业微信 API 错误: ${data.errmsg ?? data.errcode}`);
  }
  return data;
}

async function qyPost<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = await getAccessToken();
  return qyFetch<T>(`${QYAPI}${path}?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  const { corpId, secret } = getWeComConfig();
  const data = await qyFetch<{ access_token: string; expires_in: number }>(
    `${QYAPI}/gettoken?corpid=${corpId}&corpsecret=${secret}`
  );

  accessTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

export async function getJsApiTicket() {
  const now = Date.now();
  if (jsapiTicketCache && jsapiTicketCache.expiresAt > now) {
    return jsapiTicketCache.ticket;
  }

  const token = await getAccessToken();
  const data = await qyFetch<{ ticket: string; expires_in: number }>(
    `${QYAPI}/get_jsapi_ticket?access_token=${token}`
  );

  jsapiTicketCache = {
    ticket: data.ticket,
    expiresAt: now + (data.expires_in - 300) * 1000,
  };

  return data.ticket;
}

export async function getAgentConfigTicket() {
  const now = Date.now();
  if (agentTicketCache && agentTicketCache.expiresAt > now) {
    return agentTicketCache.ticket;
  }

  const token = await getAccessToken();
  const data = await qyFetch<{ ticket: string; expires_in: number }>(
    `${QYAPI}/ticket/get?access_token=${token}&type=agent_config`
  );

  agentTicketCache = {
    ticket: data.ticket,
    expiresAt: now + (data.expires_in - 300) * 1000,
  };

  return data.ticket;
}

export function signJsSdk(ticket: string, url: string) {
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash("sha1").update(raw).digest("hex");
  return { nonceStr, timestamp, signature };
}

export type WeComOAuthUser = {
  userId: string;
  userTicket?: string;
};

export type WeComUserDetail = {
  userid: string;
  mobile?: string;
  email?: string;
  biz_mail?: string;
};

export async function getOAuthUserInfo(code: string): Promise<WeComOAuthUser> {
  const token = await getAccessToken();
  const data = await qyFetch<{ userid?: string; user_ticket?: string }>(
    `${QYAPI}/auth/getuserinfo?access_token=${token}&code=${code}`
  );

  if (!data.userid) {
    throw new Error("未能获取企业微信用户身份");
  }

  return { userId: data.userid, userTicket: data.user_ticket };
}

export async function getWeComUserDetail(userTicket: string): Promise<WeComUserDetail> {
  return qyPost<WeComUserDetail>("/auth/getuserdetail", { user_ticket: userTicket });
}

export async function resolveCrmUserForWeCom(input: {
  wecomUserId: string;
  userTicket?: string;
}) {
  const { prisma } = await import("@/lib/prisma");

  const bound = await prisma.user.findUnique({
    where: { wecomUserId: input.wecomUserId },
    include: { personnelProfile: { select: { enabled: true } } },
  });
  if (bound) {
    if (bound.personnelProfile && !bound.personnelProfile.enabled) {
      return { user: null, autoBound: false as const };
    }
    return { user: bound, autoBound: false as const };
  }

  if (!input.userTicket) {
    return { user: null, autoBound: false as const };
  }

  try {
    const detail = await getWeComUserDetail(input.userTicket);
    const email = detail.biz_mail?.trim() || detail.email?.trim();
    if (!email) {
      return { user: null, autoBound: false as const };
    }

    const candidate = await prisma.user.findUnique({ where: { email } });
    if (!candidate || candidate.wecomUserId) {
      return { user: null, autoBound: false as const };
    }

    const user = await prisma.user.update({
      where: { id: candidate.id },
      data: { wecomUserId: input.wecomUserId },
    });
    return { user, autoBound: true as const };
  } catch (error) {
    console.warn("WeCom auto-bind skipped:", error);
    return { user: null, autoBound: false as const };
  }
}

export function buildOAuthUrl(redirectUri: string, state: string) {
  const { corpId, agentId } = getWeComConfig();
  const params = new URLSearchParams({
    appid: corpId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_base",
    state,
    agentid: String(agentId),
  });

  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
}

export async function createWeComSessionCookie(user: {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  phone?: string | null;
}) {
  const { createSessionCookie } = await import("@/lib/auth/session-cookie");
  return createSessionCookie(user);
}
