import crypto from "crypto";
import type { NextResponse } from "next/server";
import { resolveReturnTo } from "@/lib/navigation/return-to";

export const WECOM_DEFAULT_RETURN_TO = "/today-work";

export const WECOM_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
} as const;

export function createWeComOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function sanitizeWeComReturnTo(raw: string | null | undefined): string {
  return resolveReturnTo(raw, WECOM_DEFAULT_RETURN_TO);
}

export function resolvePublicOrigin(requestOrigin: string): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      // ignore invalid NEXTAUTH_URL
    }
  }
  return requestOrigin;
}

export function buildWeComCallbackUrl(origin: string): string {
  return new URL("/api/auth/wecom/callback", resolvePublicOrigin(origin)).toString();
}

export function attachWeComOAuthCookies(
  res: NextResponse,
  state: string,
  returnTo: string
): NextResponse {
  res.cookies.set("wecom_oauth_state", state, WECOM_OAUTH_COOKIE_OPTIONS);
  res.cookies.set("wecom_return_to", returnTo, WECOM_OAUTH_COOKIE_OPTIONS);
  return res;
}

export function clearWeComOAuthCookies(res: NextResponse): NextResponse {
  res.cookies.delete("wecom_oauth_state");
  res.cookies.delete("wecom_return_to");
  return res;
}

/** 企业微信 Web 登录扫码组件脚本 */
export const WECOM_WWLOGIN_SCRIPT_URL =
  "https://wwcdn.weixin.qq.com/node/wework/wwopen/js/wwLogin-1.2.7.js";

declare global {
  interface Window {
    WwLogin?: (options: {
      id: string;
      appid: string;
      agentid: string | number;
      redirect_uri: string;
      state: string;
      href?: string;
      lang?: string;
    }) => void;
  }
}
