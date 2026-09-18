import { NextResponse } from "next/server";
import { runCompanyCalendarSyncJob } from "@/lib/calendar/company-calendar-sync";

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

/**
 * GET/POST /api/cron/sync-company-calendar
 * - 12/10–12/31：自动同步「明年」法定假（holiday-cn）
 * - ?year=2027 强制指定年份
 * - ?force=1 已成功也可重拉
 */
async function handle(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === "未授权" ? 401 : 500 }
    );
  }

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year")?.trim();
  const year = yearRaw ? Number(yearRaw) : null;
  const force =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("force") === "true";

  if (yearRaw && (!Number.isFinite(year) || (year as number) < 2024)) {
    return NextResponse.json({ error: "无效 year" }, { status: 400 });
  }

  const result = await runCompanyCalendarSyncJob({ year, force });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
