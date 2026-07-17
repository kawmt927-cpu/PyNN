import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveReturnTo } from "@/lib/navigation/return-to";

export const WECOM_DEFAULT_RETURN_TO = "/mobile";

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

/**
 * 企微内置 WebView 对「302 + Set-Cookie」支持不稳定，常在授权回调后丢 cookie 并反复跳转，
 * 最终表现为「加载失败」。企微 UA 下改为 200 HTML，先落 cookie 再前端跳转。
 */
export function wecomFriendlyRedirect(
  req: NextRequest,
  destination: string,
  apply?: (res: NextResponse) => void
): NextResponse {
  const absolute = new URL(destination, resolvePublicOrigin(req.nextUrl.origin)).toString();
  const ua = req.headers.get("user-agent") ?? "";

  if (/wxwork/i.test(ua)) {
    const safeHref = absolute.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录成功</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fa;color:#1f2937}
    a{color:#2563eb}
  </style>
</head>
<body>
  <div style="text-align:center;padding:24px">
    <p>登录成功，正在进入系统…</p>
    <p style="font-size:14px;color:#6b7280"><a href="${safeHref}">如未自动跳转请点这里</a></p>
  </div>
  <script>location.replace(${JSON.stringify(absolute)});</script>
</body>
</html>`;
    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
    apply?.(res);
    return res;
  }

  const res = NextResponse.redirect(absolute);
  apply?.(res);
  return res;
}

/**
 * 发起企微 OAuth：同样避免 302+Set-Cookie，先 200 写入 state cookie，再跳转 open.weixin.qq.com。
 */
export function wecomFriendlyOAuthStart(
  req: NextRequest,
  oauthUrl: string,
  state: string,
  returnTo: string
): NextResponse {
  const ua = req.headers.get("user-agent") ?? "";
  if (/wxwork/i.test(ua)) {
    const safeHref = oauthUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>企微授权</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fa;color:#1f2937}
    a{color:#2563eb}
  </style>
</head>
<body>
  <div style="text-align:center;padding:24px">
    <p>正在打开企业微信授权…</p>
    <p style="font-size:14px;color:#6b7280"><a href="${safeHref}">如未自动跳转请点这里</a></p>
  </div>
  <script>location.replace(${JSON.stringify(oauthUrl)});</script>
</body>
</html>`;
    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
    return attachWeComOAuthCookies(res, state, returnTo);
  }

  const res = NextResponse.redirect(oauthUrl);
  return attachWeComOAuthCookies(res, state, returnTo);
}

/** 企业微信 Web 登录扫码组件脚本 */
export const WECOM_WWLOGIN_SCRIPT_URL =
  "https://wwcdn.weixin.qq.com/node/wework/wwopen/js/wwLogin-1.2.7.js";

declare global {
  interface Window {
    WwLogin?: new (options: {
      id: string;
      appid: string;
      agentid: string | number;
      redirect_uri: string;
      state: string;
      href?: string;
      lang?: string;
    }) => { destroyed?: () => void };
  }
}
