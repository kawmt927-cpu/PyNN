import { NextResponse } from "next/server";
import { runWecomLeaveSyncJob } from "@/lib/wecom/oa-leaves-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false as const, error: "未配置 CRON_SECRET" };
  }
  const header = req.headers.get("authorization")?.trim() ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret")?.trim() ?? "";
  if (bearer === secret || querySecret === secret) {
    return { ok: true as const };
  }
  return { ok: false as const, error: "未授权" };
}

/** GET/POST /api/cron/sync-wecom-leaves — 同步企微已通过请假（无权限则跳过） */
async function handle(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === "未授权" ? 401 : 500 }
    );
  }
  const result = await runWecomLeaveSyncJob();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
