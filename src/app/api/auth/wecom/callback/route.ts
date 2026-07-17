import { NextRequest } from "next/server";
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
  wecomFriendlyRedirect,
} from "@/lib/wecom/oauth-flow";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return wecomFriendlyRedirect(req, "/login?error=wecom_not_configured");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("wecom_oauth_state")?.value;
  const returnTo = sanitizeWeComReturnTo(
    req.cookies.get("wecom_return_to")?.value ?? WECOM_DEFAULT_RETURN_TO
  );

  if (!code || !state || !savedState || state !== savedState) {
    return wecomFriendlyRedirect(req, "/login?error=wecom_auth_failed", (res) => {
      clearWeComOAuthCookies(res);
    });
  }

  try {
    const { userId, userTicket } = await getOAuthUserInfo(code);
    const { user, autoBound } = await resolveCrmUserForWeCom({
      wecomUserId: userId,
      userTicket,
    });

    if (!user) {
      return wecomFriendlyRedirect(
        req,
        `/mobile/wecom/unbound?wecomUserId=${encodeURIComponent(userId)}`,
        (res) => {
          clearWeComOAuthCookies(res);
        }
      );
    }

    const destination = new URL(returnTo, resolveDestinationBase(req));
    if (autoBound) {
      destination.searchParams.set("wecom_bound", "1");
    }

    const cookie = await createWeComSessionCookie(user);
    return wecomFriendlyRedirect(req, `${destination.pathname}${destination.search}`, (res) => {
      clearWeComOAuthCookies(res);
      res.cookies.set(cookie.name, cookie.value, cookie.options);
    });
  } catch (error) {
    console.error("WeCom OAuth callback error:", error);
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = /not allow to access from your ip|60020/i.test(message)
      ? "wecom_ip_denied"
      : "wecom_auth_failed";
    return wecomFriendlyRedirect(req, `/login?error=${errorCode}`, (res) => {
      clearWeComOAuthCookies(res);
    });
  }
}

function resolveDestinationBase(req: NextRequest) {
  const fromEnv = process.env.NEXTAUTH_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      // ignore
    }
  }
  return req.nextUrl.origin;
}
