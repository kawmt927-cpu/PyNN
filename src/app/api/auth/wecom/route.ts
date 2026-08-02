import { NextRequest, NextResponse } from "next/server";
import { buildOAuthUrl } from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";
import { getWeComDefaultReturnTo } from "@/lib/mobile/device";
import { resolveReturnTo } from "@/lib/navigation/return-to";
import {
  buildWeComCallbackUrl,
  createWeComOAuthState,
  resolvePublicOrigin,
  resolveRequestOrigin,
  shouldHopToPublicOrigin,
  wecomFriendlyOAuthStart,
  wecomFriendlyRedirect,
} from "@/lib/wecom/oauth-flow";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.json({ error: "企业微信未配置" }, { status: 503 });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const returnTo = resolveReturnTo(
    req.nextUrl.searchParams.get("returnTo"),
    getWeComDefaultReturnTo(ua)
  );

  // 从公网 IP 进入时，先跳到正式域名再写 OAuth cookie。
  // 注意：Nginx 反代的 127.0.0.1 不能当作「IP 入口」，否则会与域名互相跳转死循环。
  const requestOrigin = resolveRequestOrigin(req);
  const publicOrigin = resolvePublicOrigin(requestOrigin);
  if (shouldHopToPublicOrigin(requestOrigin, publicOrigin)) {
    const jump = new URL("/api/auth/wecom", publicOrigin);
    jump.searchParams.set("returnTo", returnTo);
    if (/wxwork|micromessenger/i.test(ua)) {
      return wecomFriendlyRedirect(req, jump.toString());
    }
    return NextResponse.redirect(jump.toString());
  }

  const state = createWeComOAuthState();
  const redirectUri = buildWeComCallbackUrl(publicOrigin);
  const oauthUrl = buildOAuthUrl(redirectUri, state);

  return wecomFriendlyOAuthStart(req, oauthUrl, state, returnTo);
}
