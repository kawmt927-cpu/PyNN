import { NextRequest, NextResponse } from "next/server";
import { getWeComConfig, isWeComConfigured } from "@/lib/wecom/config";
import {
  attachWeComOAuthCookies,
  buildWeComCallbackUrl,
  createWeComOAuthState,
  sanitizeWeComReturnTo,
} from "@/lib/wecom/oauth-flow";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const returnTo = sanitizeWeComReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const state = createWeComOAuthState();
  const { corpId, agentId } = getWeComConfig();
  const redirectUri = buildWeComCallbackUrl(req.nextUrl.origin);

  const res = NextResponse.json({
    configured: true,
    corpId,
    agentId,
    redirectUri,
    state,
    returnTo,
  });

  return attachWeComOAuthCookies(res, state, returnTo);
}
