import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWeComSessionCookie, getOAuthUserInfo } from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.redirect(new URL("/login?error=wecom_not_configured", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("wecom_oauth_state")?.value;
  const returnTo = req.cookies.get("wecom_return_to")?.value || "/mobile/log";

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=wecom_auth_failed", req.url));
  }

  try {
    const { userId } = await getOAuthUserInfo(code);
    const user = await prisma.user.findUnique({ where: { wecomUserId: userId } });

    const res = user
      ? NextResponse.redirect(new URL(returnTo, req.url))
      : NextResponse.redirect(
          new URL(
            `/mobile/wecom/unbound?wecomUserId=${encodeURIComponent(userId)}`,
            req.url
          )
        );

    res.cookies.delete("wecom_oauth_state");
    res.cookies.delete("wecom_return_to");

    if (user) {
      const cookie = await createWeComSessionCookie(user);
      res.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return res;
  } catch (error) {
    console.error("WeCom OAuth callback error:", error);
    return NextResponse.redirect(new URL("/login?error=wecom_auth_failed", req.url));
  }
}
