import { NextRequest, NextResponse } from "next/server";
import { buildOAuthUrl } from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";
import {
  buildWeComCallbackUrl,
  createWeComOAuthState,
  sanitizeWeComReturnTo,
  wecomFriendlyOAuthStart,
} from "@/lib/wecom/oauth-flow";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.json({ error: "企业微信未配置" }, { status: 503 });
  }

  const returnTo = sanitizeWeComReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const state = createWeComOAuthState();
  const redirectUri = buildWeComCallbackUrl(req.nextUrl.origin);
  const oauthUrl = buildOAuthUrl(redirectUri, state);

  return wecomFriendlyOAuthStart(req, oauthUrl, state, returnTo);
}
