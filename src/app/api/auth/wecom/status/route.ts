import { NextResponse } from "next/server";
import { isWeComConfigured } from "@/lib/wecom/config";

/** 登录页判断企微扫码是否可用（不暴露 Secret） */
export async function GET() {
  return NextResponse.json({ configured: isWeComConfigured() });
}
