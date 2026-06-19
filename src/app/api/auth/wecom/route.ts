import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildOAuthUrl } from "@/lib/wecom/api";
import { isWeComConfigured } from "@/lib/wecom/config";

export async function GET(req: NextRequest) {
  if (!isWeComConfigured()) {
    return NextResponse.json({ error: "企业微信未配置" }, { status: 503 });
  }

  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/mobile/log";
  const state = crypto.randomBytes(16).toString("hex");

  const redirectUri = new URL("/api/auth/wecom/callback", req.nextUrl.origin).toString();

  const res = NextResponse.redirect(buildOAuthUrl(redirectUri, state));

  res.cookies.set("wecom_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  res.cookies.set("wecom_return_to", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return res;
}
