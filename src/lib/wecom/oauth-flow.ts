import crypto from "crypto";
import type { NextResponse } from "next/server";
import { resolveReturnTo } from "@/lib/navigation/return-to";

export const WECOM_DEFAULT_RETURN_TO = "/today-work";

export const WECOM_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
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

export function buildWeComCallbackUrl(origin: string): string {
  return new URL("/api/auth/wecom/callback", origin).toString();
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
