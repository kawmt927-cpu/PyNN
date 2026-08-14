import { prisma } from "@/lib/prisma";
import { UNSUBMITTED_DAILY_REPORT_BODY } from "@/lib/sales-log/unsubmitted-daily-report";
import {
  createEmbeddings,
  getEmbeddingProviderConfig,
  hashEmbeddingContent,
  truncateForEmbedding,
  type EmbeddingProviderConfig,
} from "@/lib/search/embeddings";

export const ACTIVITY_EMBED_SOURCE = {
  DAILY_LOG: "DAILY_LOG",
  FOLLOW_UP: "FOLLOW_UP",
} as const;

export type ActivityEmbedSourceType =
  (typeof ACTIVITY_EMBED_SOURCE)[keyof typeof ACTIVITY_EMBED_SOURCE];

function previewText(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}

export function buildDailyLogEmbedText(input: {
  dailyReport: string | null | undefined;
  userName?: string | null;
}) {
  const body = input.dailyReport?.trim() ?? "";
  if (!body || body === UNSUBMITTED_DAILY_REPORT_BODY) return null;
  const who = input.userName?.trim() ? `销售：${input.userName.trim()}\n` : "";
  return truncateForEmbedding(`${who}日报\n${body}`);
}

export function buildFollowUpEmbedText(input: {
  customerName?: string | null;
  content: string;
  result?: string | null;
  nextFollowUpContent?: string | null;
  methodLabel?: string | null;
}) {
  const parts = [
    input.customerName ? `客户：${input.customerName}` : null,
    input.methodLabel ? `方式：${input.methodLabel}` : null,
    input.content.trim() ? `内容：${input.content.trim()}` : null,
    input.result?.trim() ? `结果：${input.result.trim()}` : null,
    input.nextFollowUpContent?.trim()
      ? `下次：${input.nextFollowUpContent.trim()}`
      : null,
  ].filter(Boolean);
  const joined = parts.join("\n");
  if (!joined.trim()) return null;
  return truncateForEmbedding(joined);
}

async function upsertEmbeddingRow(input: {
  sourceType: ActivityEmbedSourceType;
  sourceId: string;
  userId: string;
  occurredAt: Date;
  text: string;
  provider: EmbeddingProviderConfig;
  vector?: number[];
}) {
  const contentHash = hashEmbeddingContent(input.text);
  const existing = await prisma.activityEmbedding.findUnique({
    where: {
      sourceType_sourceId: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    select: { id: true, contentHash: true, model: true },
  });
  if (
    existing &&
    existing.contentHash === contentHash &&
    existing.model === input.provider.model
  ) {
    return { id: existing.id, skipped: true as const };
  }

  const vector =
    input.vector ??
    (await createEmbeddings([input.text], input.provider))[0]!;

  const data = {
    userId: input.userId,
    occurredAt: input.occurredAt,
    contentHash,
    model: input.provider.model,
    dimensions: vector.length,
    vectorJson: JSON.stringify(vector),
    textPreview: previewText(input.text),
  };

  if (existing) {
    const row = await prisma.activityEmbedding.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
    return { id: row.id, skipped: false as const };
  }

  const row = await prisma.activityEmbedding.create({
    data: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      ...data,
    },
    select: { id: true },
  });
  return { id: row.id, skipped: false as const };
}

export async function indexDailyLogEmbedding(dailyLogId: string) {
  const provider = await getEmbeddingProviderConfig();
  if (!provider) return { ok: false as const, reason: "no_provider" };

  const row = await prisma.salesDailyLog.findUnique({
    where: { id: dailyLogId },
    select: {
      id: true,
      userId: true,
      logDate: true,
      dailyReport: true,
      user: { select: { name: true } },
    },
  });
  if (!row) return { ok: false as const, reason: "not_found" };

  const text = buildDailyLogEmbedText({
    dailyReport: row.dailyReport,
    userName: row.user.name,
  });
  if (!text) {
    await prisma.activityEmbedding.deleteMany({
      where: { sourceType: ACTIVITY_EMBED_SOURCE.DAILY_LOG, sourceId: row.id },
    });
    return { ok: true as const, skipped: true as const };
  }

  const result = await upsertEmbeddingRow({
    sourceType: ACTIVITY_EMBED_SOURCE.DAILY_LOG,
    sourceId: row.id,
    userId: row.userId,
    occurredAt: row.logDate,
    text,
    provider,
  });
  return { ok: true as const, ...result };
}

export async function indexFollowUpEmbedding(followUpId: string) {
  const provider = await getEmbeddingProviderConfig();
  if (!provider) return { ok: false as const, reason: "no_provider" };

  const row = await prisma.followUp.findUnique({
    where: { id: followUpId },
    select: {
      id: true,
      userId: true,
      followUpAt: true,
      content: true,
      result: true,
      nextFollowUpContent: true,
      method: true,
      customer: { select: { name: true } },
    },
  });
  if (!row) return { ok: false as const, reason: "not_found" };

  const { salesLogMethodLabel } = await import("@/lib/sales-log/methods");
  const text = buildFollowUpEmbedText({
    customerName: row.customer.name,
    content: row.content,
    result: row.result,
    nextFollowUpContent: row.nextFollowUpContent,
    methodLabel: salesLogMethodLabel(row.method),
  });
  if (!text) {
    await prisma.activityEmbedding.deleteMany({
      where: { sourceType: ACTIVITY_EMBED_SOURCE.FOLLOW_UP, sourceId: row.id },
    });
    return { ok: true as const, skipped: true as const };
  }

  const result = await upsertEmbeddingRow({
    sourceType: ACTIVITY_EMBED_SOURCE.FOLLOW_UP,
    sourceId: row.id,
    userId: row.userId,
    occurredAt: row.followUpAt,
    text,
    provider,
  });
  return { ok: true as const, ...result };
}

/** 异步索引单条，失败只打日志，不阻塞主流程 */
export function scheduleActivityEmbeddingIndex(
  sourceType: ActivityEmbedSourceType,
  sourceId: string
) {
  void (async () => {
    try {
      if (sourceType === ACTIVITY_EMBED_SOURCE.DAILY_LOG) {
        await indexDailyLogEmbedding(sourceId);
      } else {
        await indexFollowUpEmbedding(sourceId);
      }
    } catch (error) {
      console.error("[activity-embedding] index failed", sourceType, sourceId, error);
    }
  })();
}

/** 异步全量回填（进程内单飞，失败只打日志） */
let fullBackfillRunning = false;

export function scheduleFullActivityEmbeddingBackfill(reason = "manual") {
  if (fullBackfillRunning) return;
  fullBackfillRunning = true;
  void (async () => {
    try {
      console.info("[activity-embedding] full backfill start", reason);
      let cursor: string | null = null;
      let rounds = 0;
      let indexed = 0;
      let skipped = 0;
      for (;;) {
        const batch = await backfillActivityEmbeddings({ cursor });
        rounds += 1;
        indexed += batch.indexed;
        skipped += batch.skipped;
        if (batch.done) {
          console.info(
            "[activity-embedding] full backfill done",
            reason,
            `rounds=${rounds}`,
            `indexed=${indexed}`,
            `skipped=${skipped}`
          );
          break;
        }
        cursor = batch.nextCursor;
        if (!cursor) break;
      }
    } catch (error) {
      console.error("[activity-embedding] full backfill failed", reason, error);
    } finally {
      fullBackfillRunning = false;
    }
  })();
}

export type ActivityEmbeddingBackfillResult = {
  scanned: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: string[];
  done: boolean;
  nextCursor: string | null;
};

const BACKFILL_BATCH = 12;

/**
 * 分批回填语义索引。cursor 形如 `daily:<id>` / `follow:<id>`，空表示从日报开始。
 */
export async function backfillActivityEmbeddings(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ActivityEmbeddingBackfillResult> {
  const provider = await getEmbeddingProviderConfig();
  if (!provider) {
    return {
      scanned: 0,
      indexed: 0,
      skipped: 0,
      failed: 0,
      errors: ["未配置 Embedding API Key"],
      done: true,
      nextCursor: null,
    };
  }

  const limit = Math.min(Math.max(options?.limit ?? BACKFILL_BATCH, 1), 40);
  const cursor = options?.cursor?.trim() || null;
  const result: ActivityEmbeddingBackfillResult = {
    scanned: 0,
    indexed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    done: false,
    nextCursor: null,
  };

  let phase: "daily" | "follow" = "daily";
  let afterId: string | null = null;
  if (cursor?.startsWith("follow:")) {
    phase = "follow";
    afterId = cursor.slice("follow:".length) || null;
  } else if (cursor?.startsWith("daily:")) {
    afterId = cursor.slice("daily:".length) || null;
  }

  if (phase === "daily") {
    const rows = await prisma.salesDailyLog.findMany({
      where: {
        ...(afterId ? { id: { gt: afterId } } : {}),
        dailyReport: { not: null },
        NOT: { dailyReport: UNSUBMITTED_DAILY_REPORT_BODY },
      },
      orderBy: { id: "asc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        logDate: true,
        dailyReport: true,
        user: { select: { name: true } },
      },
    });

    if (rows.length === 0) {
      phase = "follow";
      afterId = null;
    } else {
      const prepared = rows
        .map((row) => {
          const text = buildDailyLogEmbedText({
            dailyReport: row.dailyReport,
            userName: row.user.name,
          });
          return text
            ? {
                row,
                text,
                hash: hashEmbeddingContent(text),
              }
            : null;
        })
        .filter(Boolean) as Array<{
        row: (typeof rows)[number];
        text: string;
        hash: string;
      }>;

      result.scanned += rows.length;

      const needEmbed: typeof prepared = [];
      for (const item of prepared) {
        const existing = await prisma.activityEmbedding.findUnique({
          where: {
            sourceType_sourceId: {
              sourceType: ACTIVITY_EMBED_SOURCE.DAILY_LOG,
              sourceId: item.row.id,
            },
          },
          select: { contentHash: true, model: true },
        });
        if (
          existing &&
          existing.contentHash === item.hash &&
          existing.model === provider.model
        ) {
          result.skipped += 1;
        } else {
          needEmbed.push(item);
        }
      }

      if (needEmbed.length > 0) {
        try {
          const vectors = await createEmbeddings(
            needEmbed.map((i) => i.text),
            provider
          );
          for (let i = 0; i < needEmbed.length; i++) {
            const item = needEmbed[i]!;
            try {
              await upsertEmbeddingRow({
                sourceType: ACTIVITY_EMBED_SOURCE.DAILY_LOG,
                sourceId: item.row.id,
                userId: item.row.userId,
                occurredAt: item.row.logDate,
                text: item.text,
                provider,
                vector: vectors[i],
              });
              result.indexed += 1;
            } catch (error) {
              result.failed += 1;
              result.errors.push(
                `日报 ${item.row.id}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        } catch (error) {
          result.failed += needEmbed.length;
          result.errors.push(
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      result.nextCursor = `daily:${rows[rows.length - 1]!.id}`;
      return result;
    }
  }

  // follow phase
  const followRows = await prisma.followUp.findMany({
    where: afterId ? { id: { gt: afterId } } : undefined,
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      followUpAt: true,
      content: true,
      result: true,
      nextFollowUpContent: true,
      method: true,
      customer: { select: { name: true } },
    },
  });

  if (followRows.length === 0) {
    result.done = true;
    result.nextCursor = null;
    return result;
  }

  const { salesLogMethodLabel } = await import("@/lib/sales-log/methods");
  const prepared = followRows
    .map((row) => {
      const text = buildFollowUpEmbedText({
        customerName: row.customer.name,
        content: row.content,
        result: row.result,
        nextFollowUpContent: row.nextFollowUpContent,
        methodLabel: salesLogMethodLabel(row.method),
      });
      return text
        ? { row, text, hash: hashEmbeddingContent(text) }
        : null;
    })
    .filter(Boolean) as Array<{
    row: (typeof followRows)[number];
    text: string;
    hash: string;
  }>;

  result.scanned += followRows.length;

  const needEmbed: typeof prepared = [];
  for (const item of prepared) {
    const existing = await prisma.activityEmbedding.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: ACTIVITY_EMBED_SOURCE.FOLLOW_UP,
          sourceId: item.row.id,
        },
      },
      select: { contentHash: true, model: true },
    });
    if (
      existing &&
      existing.contentHash === item.hash &&
      existing.model === provider.model
    ) {
      result.skipped += 1;
    } else {
      needEmbed.push(item);
    }
  }

  if (needEmbed.length > 0) {
    try {
      const vectors = await createEmbeddings(
        needEmbed.map((i) => i.text),
        provider
      );
      for (let i = 0; i < needEmbed.length; i++) {
        const item = needEmbed[i]!;
        try {
          await upsertEmbeddingRow({
            sourceType: ACTIVITY_EMBED_SOURCE.FOLLOW_UP,
            sourceId: item.row.id,
            userId: item.row.userId,
            occurredAt: item.row.followUpAt,
            text: item.text,
            provider,
            vector: vectors[i],
          });
          result.indexed += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push(
            `往来 ${item.row.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      result.failed += needEmbed.length;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  result.nextCursor = `follow:${followRows[followRows.length - 1]!.id}`;
  return result;
}

export async function getActivityEmbeddingStats() {
  const [total, daily, follow] = await Promise.all([
    prisma.activityEmbedding.count(),
    prisma.activityEmbedding.count({
      where: { sourceType: ACTIVITY_EMBED_SOURCE.DAILY_LOG },
    }),
    prisma.activityEmbedding.count({
      where: { sourceType: ACTIVITY_EMBED_SOURCE.FOLLOW_UP },
    }),
  ]);
  return { total, daily, follow };
}
