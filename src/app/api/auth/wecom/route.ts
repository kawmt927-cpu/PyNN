import { NextRequest, NextResponse } from "next/server";
import { buildOAuthUrl } from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";
import { getWeComDefaultReturnTo } from "@/lib/mobile/device";
import { resolveReturnTo } from "@/lib/navigation/return-to";
import {
  buildWeComCallbackUrl,
  createWeComOAuthState,
  wecomFriendlyOAuthStart,
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
  const state = createWeComOAuthState();
  const redirectUri = buildWeComCallbackUrl(req.nextUrl.origin);
  const oauthUrl = buildOAuthUrl(redirectUri, state);

  return wecomFriendlyOAuthStart(req, oauthUrl, state, returnTo);
}
