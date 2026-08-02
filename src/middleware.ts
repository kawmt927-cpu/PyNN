import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { UserRole } from "@prisma/client";
import { isWeComConfigured } from "@/lib/wecom/config";
import { getDefaultHomeForRole } from "@/lib/permissions";
import { canAccessSalesMobile, getMobileHomeForRole } from "@/lib/mobile/sales-roles";
import { isPhoneOrWeComUserAgent, mapDesktopPathToMobile } from "@/lib/mobile/device";
import { UI_MODE_COOKIE } from "@/lib/mobile/ui-mode";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/approvals",
  "/contracts",
  "/follow-ups",
  "/opportunities",
  "/projects",
  "/my-tasks",
  "/personnel",
  "/sales-personnel",
  "/sales-costs",
  "/sales-log",
  "/daily-reports",
  "/today-work",
  "/plans-tasks",
  "/notifications",
  "/expenses",
  "/mobile",
  "/admin",
  "/hr",
];

const WECOM_OAUTH_SKIP_PREFIXES = [
  "/mobile/wecom/unbound",
  "/mobile/wecom/activate",
];

function isWeComOrWeChatWorkbench(userAgent: string) {
  // 微信里的企微工作台 / 应用消息 WebView 通常是 MicroMessenger，不一定含 wxwork
  return /wxwork|micromessenger/i.test(userAgent);
}

function isIpHostname(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/** 仅公网 IP 才做旧链接桥接；127.0.0.1 / 内网是 Nginx 反代，不能跳 */
function isPublicIpHostname(hostname: string) {
  if (!isIpHostname(hostname)) return false;
  if (hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
  if (hostname.startsWith("10.")) return false;
  if (hostname.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return false;
  return true;
}

/** 对外可见主机名：优先 Host / X-Forwarded-Host（反代后 nextUrl 可能是 127.0.0.1） */
function requestPublicHostname(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = req.headers.get("host")?.split(":")[0]?.trim();
  return (forwarded || hostHeader || req.nextUrl.hostname).split(":")[0];
}

function publicAppOrigin() {
  for (const raw of [
    process.env.PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    "https://crm.pynntech.com",
  ]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (isIpHostname(url.hostname)) continue;
      return url.origin;
    } catch {
      // ignore
    }
  }
  return "https://crm.pynntech.com";
}

/** 旧推送里的 IP 链接：用 HTML 跳到正式域名（比跨协议 302 在微信里更稳） */
function bridgeFromIpHost(req: NextRequest, destination: string) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/wxwork|micromessenger/i.test(ua)) {
    const safeHref = destination.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>正在进入培安 CRM</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fa;color:#1f2937}
    a{color:#2563eb}
  </style>
</head>
<body>
  <div style="text-align:center;padding:24px">
    <p>旧链接已升级为域名访问，正在跳转…</p>
    <p style="font-size:14px;color:#6b7280"><a href="${safeHref}">如未自动跳转请点这里</a></p>
  </div>
  <script>location.replace(${JSON.stringify(destination)});</script>
</body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.redirect(destination);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publicHost = requestPublicHostname(req);

  // 仅当用户直接用公网 IP 打开时桥接；Nginx→127.0.0.1 反代绝不能触发
  if (isPublicIpHostname(publicHost)) {
    const origin = publicAppOrigin();
    const returnTo = `${pathname}${req.nextUrl.search}`;
    const ua = req.headers.get("user-agent") ?? "";
    const inWeComOrWeChat = isWeComOrWeChatWorkbench(ua);
    const destination =
      inWeComOrWeChat && isWeComConfigured()
        ? `${origin}/api/auth/wecom?returnTo=${encodeURIComponent(returnTo)}`
        : `${origin}${returnTo}`;
    return bridgeFromIpHost(req, destination);
  }

  if (pathname === "/") {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const role = token.role as UserRole;
    const ua = req.headers.get("user-agent") ?? "";
    const preferPc = req.cookies.get(UI_MODE_COOKIE)?.value === "pc";
    if (isPhoneOrWeComUserAgent(ua) && !preferPc) {
      return NextResponse.redirect(new URL(getMobileHomeForRole(role), req.url));
    }
    const home = getDefaultHomeForRole(role);
    return NextResponse.redirect(new URL(home, req.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const ua = req.headers.get("user-agent") ?? "";
  const inWeComOrWeChat = isWeComOrWeChatWorkbench(ua);

  if (!token && WECOM_OAUTH_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!token && inWeComOrWeChat && isWeComConfigured()) {
    const returnTo = `${pathname}${req.nextUrl.search}`;
    const oauthUrl = new URL("/api/auth/wecom", req.nextUrl.origin);
    oauthUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(oauthUrl);
  }

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("returnTo", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as UserRole | undefined;

  const uiMode = req.cookies.get(UI_MODE_COOKIE)?.value;
  const onPhoneUa = isPhoneOrWeComUserAgent(ua);

  // 手机端路径：非销售侧角色 → 提示使用 PC
  if (
    pathname.startsWith("/mobile") &&
    !pathname.startsWith("/mobile/wecom") &&
    !pathname.startsWith("/mobile/pc-only") &&
    role &&
    !canAccessSalesMobile(role)
  ) {
    return NextResponse.redirect(new URL("/mobile/pc-only", req.url));
  }

  // 手机 UA + 销售侧角色：电脑端路径映射到手机端等价页（保留深链）
  if (
    role &&
    canAccessSalesMobile(role) &&
    onPhoneUa &&
    uiMode !== "pc" &&
    !pathname.startsWith("/mobile") &&
    !pathname.startsWith("/api")
  ) {
    const mapped =
      mapDesktopPathToMobile(pathname, req.nextUrl.search) ?? getMobileHomeForRole(role);
    return NextResponse.redirect(new URL(mapped, req.url));
  }

  // PC / PC 企微误入 /mobile：回到电脑端（显式切到手机端 cookie=mobile 可保留）
  if (
    role &&
    !onPhoneUa &&
    uiMode !== "mobile" &&
    pathname.startsWith("/mobile") &&
    !pathname.startsWith("/mobile/wecom") &&
    !pathname.startsWith("/mobile/pc-only")
  ) {
    return NextResponse.redirect(new URL(getDefaultHomeForRole(role), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/customers/:path*",
    "/approvals/:path*",
    "/contracts/:path*",
    "/follow-ups/:path*",
    "/opportunities/:path*",
    "/projects/:path*",
    "/my-tasks/:path*",
    "/personnel/:path*",
    "/sales-personnel/:path*",
    "/sales-costs/:path*",
    "/sales-log",
    "/sales-log/:path*",
    "/daily-reports",
    "/daily-reports/:path*",
    "/today-work",
    "/today-work/:path*",
    "/plans-tasks",
    "/plans-tasks/:path*",
    "/mobile/:path*",
    "/admin/:path*",
    "/hr",
    "/hr/:path*",
    "/notifications",
    "/notifications/:path*",
    "/expenses",
    "/expenses/:path*",
  ],
};
