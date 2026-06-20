import type { Prisma } from "@prisma/client";

/** 去掉空白 */
export function normalizeSearchTerm(q: string) {
  return q.trim().replace(/\s+/g, "");
}

/** 去掉常见行政区划字，便于「兴化人民医院」匹配「兴化市人民医院」 */
export function normalizeOrgName(s: string) {
  return normalizeSearchTerm(s).replace(/[省市县区镇乡]/g, "");
}

export function isSubsequenceMatch(needle: string, haystack: string) {
  const n = normalizeOrgName(needle);
  const h = normalizeOrgName(haystack);
  if (!n) return false;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return i === n.length;
}

/** 提取可用于 DB 宽泛检索的关键词 */
export function extractSearchKeywords(q: string) {
  const compact = normalizeSearchTerm(q);
  if (!compact) return [];

  const keywords = new Set<string>();
  const patterns = [
    "人民医院",
    "医疗健康",
    "有限公司",
    "有限责任公司",
    "医院",
    "人民",
    "公司",
    "集团",
  ];

  let rest = compact;
  for (const pattern of patterns.sort((a, b) => b.length - a.length)) {
    const idx = rest.indexOf(pattern);
    if (idx >= 0) {
      keywords.add(pattern);
      const before = rest.slice(0, idx);
      if (before.length >= 2) keywords.add(before);
      rest = rest.slice(idx + pattern.length);
    }
  }

  if (rest.length >= 2) keywords.add(rest);
  if (compact.length >= 2) keywords.add(compact.slice(0, 2));

  return [...keywords].filter(Boolean);
}

/** 0 表示不匹配，越大越相关 */
export function scoreNameMatch(query: string, name: string) {
  const q = normalizeSearchTerm(query);
  const n = name.trim();
  if (!q || !n) return 0;

  if (n.includes(q)) return 100;

  const qn = normalizeOrgName(q);
  const nn = normalizeOrgName(n);
  if (qn && nn.includes(qn)) return 95;
  if (isSubsequenceMatch(q, n)) return 90;

  const keywords = extractSearchKeywords(q);
  if (keywords.length >= 2 && keywords.every((kw) => n.includes(kw) || nn.includes(normalizeOrgName(kw)))) {
    return 80;
  }

  if (keywords.some((kw) => kw.length >= 2 && n.includes(kw))) return 60;

  return 0;
}

export function rankByNameMatch<T extends { name: string }>(query: string, rows: T[]) {
  return rows
    .map((row) => ({ row, score: scoreNameMatch(query, row.name) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, "zh-CN"))
    .map((item) => item.row);
}

/** 数据库宽泛候选集（后续在内存中精排） */
export function buildBroadNameWhere(
  field: "name" | "title",
  q: string
): Prisma.CustomerWhereInput | Prisma.OpportunityWhereInput {
  const compact = normalizeSearchTerm(q);
  if (!compact) return {};

  const keywords = extractSearchKeywords(compact);
  const orClauses: Array<Record<string, unknown>> = [
    { [field]: { contains: compact } },
    { [field]: { contains: compact.slice(0, Math.min(2, compact.length)) } },
  ];

  for (const kw of keywords) {
    if (kw.length >= 2) {
      orClauses.push({ [field]: { contains: kw } });
    }
  }

  const qn = normalizeOrgName(compact);
  if (qn && qn !== compact) {
    orClauses.push({ [field]: { contains: qn.slice(0, Math.min(2, qn.length)) } });
  }

  return { OR: orClauses } as Prisma.CustomerWhereInput;
}

/** @deprecated 保留兼容，列表页仍可用 */
export function buildFuzzyContainsFilter(
  field: "name" | "title",
  q: string
): Prisma.CustomerWhereInput | Prisma.OpportunityWhereInput {
  return buildBroadNameWhere(field, q);
}
