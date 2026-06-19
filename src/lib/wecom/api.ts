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
  url: string
): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  const data = (await res.json()) as T & { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`企业微信 API 错误: ${data.errmsg ?? data.errcode}`);
  }
  return data;
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
  email: string;
  name: string;
  role: UserRole;
}) {
  const { encode } = await import("next-auth/jwt");
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET 未配置");

  const sessionToken = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    secret,
    maxAge: 30 * 24 * 60 * 60,
  });

  const secure = process.env.NODE_ENV === "production";
  const cookieName = secure
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  return {
    name: cookieName,
    value: sessionToken,
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    },
  };
}
