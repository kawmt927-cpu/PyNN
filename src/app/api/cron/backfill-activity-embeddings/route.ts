import { NextResponse } from "next/server";
import {
  backfillActivityEmbeddings,
  getActivityEmbeddingStats,
} from "@/lib/sales-log/activity-embedding-index";
import { getEmbeddingProviderConfig } from "@/lib/search/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
 * 语义索引回填（幂等）。
 * - 默认跑一批
 * - ?all=1：在时限内连续多批直到完成或超时（可重复调用直至 done）
 */
async function handle(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.error === "未授权" ? 401 : 500 }
    );
  }

  const provider = await getEmbeddingProviderConfig();
  if (!provider) {
    return NextResponse.json(
      { error: "未配置 Embedding API（STT_API_KEY / EMBEDDING_API_KEY）" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const runAll = url.searchParams.get("all") === "1";
  let cursor = url.searchParams.get("cursor");
  const started = Date.now();
  const budgetMs = runAll ? 240_000 : 60_000;

  let rounds = 0;
  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let scanned = 0;
  const errors: string[] = [];
  let done = false;
  let nextCursor: string | null = cursor;

  while (Date.now() - started < budgetMs) {
    const batch = await backfillActivityEmbeddings({
      cursor: nextCursor,
      limit: 12,
    });
    rounds += 1;
    indexed += batch.indexed;
    skipped += batch.skipped;
    failed += batch.failed;
    scanned += batch.scanned;
    errors.push(...batch.errors.slice(0, 3));
    nextCursor = batch.nextCursor;
    done = batch.done;
    if (done || !runAll) break;
  }

  const stats = await getActivityEmbeddingStats();
  return NextResponse.json({
    ok: true,
    model: provider.model,
    rounds,
    scanned,
    indexed,
    skipped,
    failed,
    done,
    nextCursor,
    stats,
    errors: errors.slice(0, 10),
    elapsedMs: Date.now() - started,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
