import { NextResponse } from "next/server";
import {
  inferDailyReportRemindSlot,
  isDailyReportRemindSlot,
  runDailyReportRemindJob,
  type DailyReportRemindSlot,
} from "@/lib/sales-log/daily-report-reminders";

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

function resolveSlot(req: Request): {
  slot: DailyReportRemindSlot | null;
  reason?: string;
} {
  const url = new URL(req.url);
  const raw = url.searchParams.get("slot")?.trim() ?? "";
  if (raw && isDailyReportRemindSlot(raw)) return { slot: raw };
  if (raw === "auto" || !raw) {
    const inferred = inferDailyReportRemindSlot();
    if (!inferred) {
      return {
        slot: null,
        reason: "当前不在 20/21 点催交或 22 点后迟交时段，请显式指定 slot=20|21|late",
      };
    }
    return { slot: inferred };
  }
  return { slot: null, reason: "无效 slot，请使用 20 / 21 / late / auto" };
}

async function handle(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "未授权" ? 401 : 500 });
  }

  const resolved = resolveSlot(req);
  if (!resolved.slot) {
    return NextResponse.json({ error: resolved.reason ?? "无效 slot" }, { status: 400 });
  }

  const result = await runDailyReportRemindJob(resolved.slot);
  return NextResponse.json({ ok: true, ...result });
}

/** GET/POST /api/cron/daily-report-reminders?slot=20|21|late|auto */
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
