import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isWeComConfigured } from "@/lib/wecom/config";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/approvals",
  "/contracts",
  "/follow-ups",
  "/projects",
  "/my-tasks",
  "/personnel",
  "/sales-personnel",
  "/sales-costs",
  "/mobile",
  "/admin",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const ua = req.headers.get("user-agent") ?? "";
  const inWeCom = /wxwork/i.test(ua);

  if (!token && pathname.startsWith("/mobile/wecom/unbound")) {
    return NextResponse.next();
  }

  if (!token && pathname.startsWith("/mobile") && inWeCom && isWeComConfigured()) {
    const returnTo = encodeURIComponent(pathname);
    return NextResponse.redirect(
      new URL(`/api/auth/wecom?returnTo=${returnTo}`, req.url)
    );
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/approvals/:path*",
    "/contracts/:path*",
    "/follow-ups/:path*",
    "/projects/:path*",
    "/my-tasks/:path*",
    "/personnel/:path*",
    "/sales-personnel/:path*",
    "/sales-costs/:path*",
    "/mobile/:path*",
    "/admin/:path*",
  ],
};
