import { NextRequest, NextResponse } from "next/server";
import { buildOAuthUrl } from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";
import {
  attachWeComOAuthCookies,
  buildWeComCallbackUrl,
  createWeComOAuthState,
  sanitizeWeComReturnTo,
} from "@/lib/wecom/oauth-flow";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.json({ error: "企业微信未配置" }, { status: 503 });
  }

  const returnTo = sanitizeWeComReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const state = createWeComOAuthState();
  const redirectUri = buildWeComCallbackUrl(req.nextUrl.origin);

  const res = NextResponse.redirect(buildOAuthUrl(redirectUri, state));
  return attachWeComOAuthCookies(res, state, returnTo);
}
