import type { UserRole } from "@prisma/client";
import { endOfDay, format, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  ACTIVITY_SEARCH_LIMIT,
  type ActivitySearchHit,
  type ActivitySearchParams,
  type ActivitySearchResult,
  buildKeywordSnippet,
  defaultActivitySearchRange,
  emptyActivityEntityHits,
  extractCustomerNamesFromDailyReport,
  normalizeActivitySearchQuery,
  parseActivitySearchDay,
} from "@/lib/sales-log/activity-keyword-search";
import {
  ACTIVITY_EMBED_SOURCE,
  getActivityEmbeddingStats,
  scheduleFullActivityEmbeddingBackfill,
} from "@/lib/sales-log/activity-embedding-index";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import {
  cosineSimilarity,
  createEmbedding,
  getEmbeddingProviderConfig,
  parseVectorJson,
} from "@/lib/search/embeddings";

/** 低于此相似度不返回（余弦） */
export const SEMANTIC_SEARCH_MIN_SCORE = 0.28;
/** 候选向量上限（日期范围内） */
export const SEMANTIC_CANDIDATE_CAP = 2_500;

export type ActivitySemanticSearchResult = ActivitySearchResult & {
  mode: "semantic";
  indexedTotal: number;
  warning?: string | null;
};

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function resolveUserScope(
  role: UserRole,
  sessionUserId: string,
  filterUserId: string | null | undefined
) {
  if (!canViewAllDailyReports(role)) {
    return { userId: sessionUserId as string | undefined };
  }
  if (filterUserId?.trim()) {
    return { userId: filterUserId.trim() };
  }
  return { userId: undefined as string | undefined };
}

function formatCustomerLabel(names: string[]) {
  if (names.length === 0) return null;
  if (names.length <= 3) return names.join("、");
  return `${names.slice(0, 3).join("、")} 等${names.length}家`;
}

export async function searchSalesActivityBySemantic(
  role: UserRole,
  sessionUserId: string,
  input: ActivitySearchParams,
  now = new Date()
): Promise<ActivitySemanticSearchResult | null> {
  const q = normalizeActivitySearchQuery(input.q);
  if (!q) return null;

  const provider = await getEmbeddingProviderConfig();
  const stats = await getActivityEmbeddingStats();
  if (!provider) {
    return {
      mode: "semantic",
      q,
      from: input.from?.trim() || dayKey(defaultActivitySearchRange(now).from),
      to: input.to?.trim() || dayKey(defaultActivitySearchRange(now).to),
      userId: null,
      dailyLogs: [],
      followUps: [],
      ...emptyActivityEntityHits(),
      truncated: false,
      indexedTotal: stats.total,
      warning: "未配置 Embedding API，无法语义搜索。请配置 LLM/Embedding Key 后回填索引。",
    };
  }
  if (stats.total === 0) {
    scheduleFullActivityEmbeddingBackfill("semantic-search-empty-index");
    const defaults = defaultActivitySearchRange(now);
    return {
      mode: "semantic",
      q,
      from: input.from?.trim() || dayKey(defaults.from),
      to: input.to?.trim() || dayKey(defaults.to),
      userId: null,
      dailyLogs: [],
      followUps: [],
      ...emptyActivityEntityHits(),
      truncated: false,
      indexedTotal: 0,
      warning: "语义索引正在后台建立，请稍后再试（部署后也会自动回填）。",
    };
  }

  const defaults = defaultActivitySearchRange(now);
  const fromDate = parseActivitySearchDay(input.from) ?? defaults.from;
  let toDate = parseActivitySearchDay(input.to) ?? defaults.to;
  if (toDate.getTime() < fromDate.getTime()) toDate = fromDate;
  const fromStart = startOfDay(fromDate);
  const toEnd = endOfDay(toDate);
  const userScope = resolveUserScope(role, sessionUserId, input.userId);

  const queryVector = await createEmbedding(q);

  const candidates = await prisma.activityEmbedding.findMany({
    where: {
      occurredAt: { gte: fromStart, lte: toEnd },
      ...(userScope.userId ? { userId: userScope.userId } : {}),
      model: provider.model,
    },
    orderBy: { occurredAt: "desc" },
    take: SEMANTIC_CANDIDATE_CAP + 1,
    select: {
      sourceType: true,
      sourceId: true,
      vectorJson: true,
      textPreview: true,
      occurredAt: true,
      userId: true,
    },
  });

  const truncatedCandidates = candidates.length > SEMANTIC_CANDIDATE_CAP;
  const scored = candidates
    .slice(0, SEMANTIC_CANDIDATE_CAP)
    .map((row) => {
      let score = 0;
      try {
        score = cosineSimilarity(queryVector, parseVectorJson(row.vectorJson));
      } catch {
        score = 0;
      }
      return { ...row, score };
    })
    .filter((row) => row.score >= SEMANTIC_SEARCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const topDaily = scored
    .filter((r) => r.sourceType === ACTIVITY_EMBED_SOURCE.DAILY_LOG)
    .slice(0, ACTIVITY_SEARCH_LIMIT);
  const topFollow = scored
    .filter((r) => r.sourceType === ACTIVITY_EMBED_SOURCE.FOLLOW_UP)
    .slice(0, ACTIVITY_SEARCH_LIMIT);

  const [dailyRows, followRows] = await Promise.all([
    topDaily.length
      ? prisma.salesDailyLog.findMany({
          where: { id: { in: topDaily.map((r) => r.sourceId) } },
          select: {
            id: true,
            logDate: true,
            dailyReport: true,
            userId: true,
            user: { select: { id: true, name: true } },
            followUps: {
              select: { customer: { select: { name: true } } },
            },
            checkIns: {
              where: { customerId: { not: null } },
              select: { customer: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    topFollow.length
      ? prisma.followUp.findMany({
          where: { id: { in: topFollow.map((r) => r.sourceId) } },
          select: {
            id: true,
            followUpAt: true,
            content: true,
            result: true,
            nextFollowUpContent: true,
            method: true,
            userId: true,
            customerId: true,
            user: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const dailyById = new Map(dailyRows.map((r) => [r.id, r]));
  const followById = new Map(followRows.map((r) => [r.id, r]));
  const scoreBySource = new Map(
    scored.map((r) => [`${r.sourceType}:${r.sourceId}`, r.score] as const)
  );
  const previewBySource = new Map(
    scored.map((r) => [`${r.sourceType}:${r.sourceId}`, r.textPreview] as const)
  );

  const dailyLogs: ActivitySearchHit[] = [];
  for (const hit of topDaily) {
    const row = dailyById.get(hit.sourceId);
    if (!row) continue;
    const date = dayKey(row.logDate);
    const body = row.dailyReport?.trim() ?? "";
    const names = [
      ...row.followUps.map((f) => f.customer.name),
      ...row.checkIns.map((c) => c.customer?.name).filter((n): n is string => Boolean(n)),
      ...extractCustomerNamesFromDailyReport(body),
    ];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const n of names) {
      const k = n.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(n);
    }
    const score = scoreBySource.get(`${ACTIVITY_EMBED_SOURCE.DAILY_LOG}:${row.id}`) ?? 0;
    dailyLogs.push({
      kind: "daily_log",
      id: row.id,
      at: row.logDate,
      userId: row.user.id,
      userName: row.user.name,
      title: `日报 · ${date}`,
      snippet:
        buildKeywordSnippet(body, q) ||
        previewBySource.get(`${ACTIVITY_EMBED_SOURCE.DAILY_LOG}:${row.id}`) ||
        body.slice(0, 120),
      href: `/daily-reports?date=${date}&userId=${row.userId}`,
      meta: formatCustomerLabel(unique),
      score,
    });
  }

  const followUps: ActivitySearchHit[] = [];
  for (const hit of topFollow) {
    const row = followById.get(hit.sourceId);
    if (!row) continue;
    const joined = [row.content, row.result, row.nextFollowUpContent]
      .filter((s): s is string => Boolean(s?.trim()))
      .join(" / ");
    const score = scoreBySource.get(`${ACTIVITY_EMBED_SOURCE.FOLLOW_UP}:${row.id}`) ?? 0;
    followUps.push({
      kind: "follow_up",
      id: row.id,
      at: row.followUpAt,
      userId: row.user.id,
      userName: row.user.name,
      title: row.customer.name,
      snippet:
        buildKeywordSnippet(joined || row.customer.name, q) ||
        previewBySource.get(`${ACTIVITY_EMBED_SOURCE.FOLLOW_UP}:${row.id}`) ||
        joined.slice(0, 120),
      href: `/customers/${row.customerId}/follow-ups`,
      meta: salesLogMethodLabel(row.method),
      score,
    });
  }

  return {
    mode: "semantic",
    q,
    from: dayKey(fromStart),
    to: dayKey(toDate),
    userId: userScope.userId ?? null,
    dailyLogs,
    followUps,
    ...emptyActivityEntityHits(),
    truncated: truncatedCandidates,
    indexedTotal: stats.total,
    warning: truncatedCandidates
      ? "候选向量过多已截断，可缩小时间范围以提高召回。"
      : null,
  };
}
