import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { UserRole } from "@prisma/client";
import { isWeComConfigured, isWeComUserAgent } from "@/lib/wecom/config";
import { getDefaultHomeForRole } from "@/lib/permissions";
import { canAccessSalesMobile, getMobileHomeForRole } from "@/lib/mobile/sales-roles";
import { isPhoneOrWeComUserAgent } from "@/lib/mobile/device";
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
  "/mobile",
  "/admin",
  "/hr",
];

const WECOM_OAUTH_SKIP_PREFIXES = [
  "/mobile/wecom/unbound",
  "/mobile/wecom/activate",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  const inWeCom = isWeComUserAgent(ua);

  if (!token && WECOM_OAUTH_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!token && inWeCom && isWeComConfigured()) {
    const returnTo = encodeURIComponent(`${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(
      new URL(`/api/auth/wecom?returnTo=${returnTo}`, req.url)
    );
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

  // 手机 UA + 销售侧角色：默认进手机端（显式切到电脑端时 cookie=pc 可保留 PC）
  if (
    role &&
    canAccessSalesMobile(role) &&
    onPhoneUa &&
    uiMode !== "pc" &&
    !pathname.startsWith("/mobile") &&
    !pathname.startsWith("/api")
  ) {
    return NextResponse.redirect(new URL(getMobileHomeForRole(role), req.url));
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
  ],
};
