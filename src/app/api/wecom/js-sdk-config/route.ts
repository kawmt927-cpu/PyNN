import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getAgentConfigTicket,
  getJsApiTicket,
  signJsSdk,
} from "@/lib/wecom/api";
import { getWeComConfig, isWeComConfigured } from "@/lib/wecom/config";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!isWeComConfigured()) {
    return NextResponse.json({ error: "企业微信未配置" }, { status: 503 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  try {
    const { corpId, agentId } = getWeComConfig();
    const jsTicket = await getJsApiTicket();
    const agentTicket = await getAgentConfigTicket();
    const corpSign = signJsSdk(jsTicket, url);
    const agentSign = signJsSdk(agentTicket, url);
    return NextResponse.json({
      corpId,
      agentId,
      corp: corpSign,
      agent: agentSign,
    });
  } catch (error) {
    console.error("WeCom JS-SDK config error:", error);
    return NextResponse.json({ error: "获取 JS-SDK 配置失败" }, { status: 500 });
  }
}
