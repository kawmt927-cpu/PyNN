import { NextRequest, NextResponse } from "next/server";
import {
  createWeComSessionCookie,
  getOAuthUserInfo,
  resolveCrmUserForWeCom,
} from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";
import {
  clearWeComOAuthCookies,
  sanitizeWeComReturnTo,
  WECOM_DEFAULT_RETURN_TO,
} from "@/lib/wecom/oauth-flow";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.redirect(new URL("/login?error=wecom_not_configured", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("wecom_oauth_state")?.value;
  const returnTo = sanitizeWeComReturnTo(
    req.cookies.get("wecom_return_to")?.value ?? WECOM_DEFAULT_RETURN_TO
  );

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=wecom_auth_failed", req.url));
  }

  try {
    const { userId, userTicket } = await getOAuthUserInfo(code);
    const { user, autoBound } = await resolveCrmUserForWeCom({
      wecomUserId: userId,
      userTicket,
    });

    if (!user) {
      const res = NextResponse.redirect(
        new URL(
          `/mobile/wecom/unbound?wecomUserId=${encodeURIComponent(userId)}`,
          req.url
        )
      );
      clearWeComOAuthCookies(res);
      return res;
    }

    const destination = new URL(returnTo, req.url);
    if (autoBound) {
      destination.searchParams.set("wecom_bound", "1");
    }

    const res = NextResponse.redirect(destination);
    clearWeComOAuthCookies(res);
    const cookie = await createWeComSessionCookie(user);
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch (error) {
    console.error("WeCom OAuth callback error:", error);
    return NextResponse.redirect(new URL("/login?error=wecom_auth_failed", req.url));
  }
}
