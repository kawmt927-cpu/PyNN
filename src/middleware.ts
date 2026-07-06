import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { UserRole } from "@prisma/client";
import { isWeComConfigured, isWeComUserAgent } from "@/lib/wecom/config";
import { getDefaultHomeForRole } from "@/lib/permissions";

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
  "/mobile",
  "/admin",
];

const WECOM_OAUTH_SKIP_PREFIXES = ["/mobile/wecom/unbound"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const home = getDefaultHomeForRole(token.role as UserRole);
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
  ],
};
