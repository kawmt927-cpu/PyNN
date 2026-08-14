import type { Prisma, UserRole } from "@prisma/client";
import { format, parse, isValid, startOfDay, endOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  canManageCustomerOwner,
  customerResponsibleWhere,
} from "@/lib/customers/access";
import { canViewAllOpportunities } from "@/lib/opportunities/access";
import { UNSUBMITTED_DAILY_REPORT_BODY } from "@/lib/sales-log/unsubmitted-daily-report";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";

export const ACTIVITY_SEARCH_DEFAULT_DAYS = 90;
export const ACTIVITY_SEARCH_LIMIT = 40;
export const ACTIVITY_SEARCH_ENTITY_LIMIT = 20;
export const ACTIVITY_SEARCH_MIN_Q = 2;

export type ActivitySearchHitKind =
  | "daily_log"
  | "follow_up"
  | "customer"
  | "contact"
  | "opportunity"
  | "contract";

export type ActivitySearchHit = {
  kind: ActivitySearchHitKind;
  id: string;
  at: Date;
  userId: string;
  userName: string;
  title: string;
  snippet: string;
  href: string;
  meta?: string | null;
  /** 语义搜索相似度 0～1 */
  score?: number;
};

export type ActivitySearchMode = "keyword" | "semantic";

export type ActivitySearchParams = {
  q: string;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
  mode?: ActivitySearchMode | null;
};

export type ActivitySearchResult = {
  q: string;
  from: string;
  to: string;
  userId: string | null;
  dailyLogs: ActivitySearchHit[];
  followUps: ActivitySearchHit[];
  customers: ActivitySearchHit[];
  contacts: ActivitySearchHit[];
  opportunities: ActivitySearchHit[];
  contracts: ActivitySearchHit[];
  truncated: boolean;
  mode?: ActivitySearchMode;
  indexedTotal?: number;
  warning?: string | null;
};

export function emptyActivityEntityHits(): Pick<
  ActivitySearchResult,
  "customers" | "contacts" | "opportunities" | "contracts"
> {
  return {
    customers: [],
    contacts: [],
    opportunities: [],
    contracts: [],
  };
}

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function parseActivitySearchDay(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const d = parse(raw.trim(), "yyyy-MM-dd", new Date());
  return isValid(d) ? startOfDay(d) : null;
}

/** 清洗关键字；过短返回 null */
export function normalizeActivitySearchQuery(raw: string | null | undefined) {
  const q = (raw ?? "").trim().replace(/\s+/g, " ");
  if (q.length < ACTIVITY_SEARCH_MIN_Q) return null;
  if (q.length > 80) return q.slice(0, 80);
  return q;
}

export function defaultActivitySearchRange(now = new Date()) {
  const to = startOfDay(now);
  const from = startOfDay(subDays(to, ACTIVITY_SEARCH_DEFAULT_DAYS - 1));
  return { from, to };
}

/** 从正文截取含关键字的摘要 */
export function buildKeywordSnippet(text: string, q: string, radius = 48) {
  const body = text.replace(/\s+/g, " ").trim();
  if (!body) return "";
  const lower = body.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) {
    return body.length > radius * 2 ? `${body.slice(0, radius * 2)}…` : body;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + needle.length + radius);
  const slice = body.slice(start, end);
  return `${start > 0 ? "…" : ""}${slice}${end < body.length ? "…" : ""}`;
}

/** 从日报正文解析客户名（兼容导入格式【医院客户：xxx】等） */
export function extractCustomerNamesFromDailyReport(text: string | null | undefined) {
  const body = text?.trim() ?? "";
  if (!body) return [] as string[];

  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const name = raw
      .replace(/[（(].*?[）)]/g, "")
      .replace(/[·•].*$/, "")
      .replace(/[：:].*$/, "")
      .trim();
    if (!name || name.length > 40) return;
    if (/^(工作|档案|完整背景|内部|表\d)/.test(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  for (const m of body.matchAll(
    /【\s*(?:医院|渠道|渠道\/第三方)?客户\s*[：:]\s*([^】]+?)\s*】/g
  )) {
    push(m[1]);
  }
  for (const m of body.matchAll(/【\s*新客户\s*[：:]\s*([^】]+?)\s*】/g)) {
    push(m[1]);
  }
  for (const m of body.matchAll(
    /【\s*(?:医院|渠道|医院\/渠道)\s*[·•/]\s*([^】]+?)\s*[·•]/g
  )) {
    push(m[1]);
  }

  return names;
}

function formatCustomerLabel(names: string[]) {
  if (names.length === 0) return null;
  if (names.length <= 3) return names.join("、");
  return `${names.slice(0, 3).join("、")} 等${names.length}家`;
}

function resolveUserScope(
  role: UserRole,
  sessionUserId: string,
  filterUserId: string | null | undefined
) {
  if (!canViewAllDailyReports(role)) {
    return { userId: sessionUserId };
  }
  if (filterUserId?.trim()) {
    return { userId: filterUserId.trim() };
  }
  return {};
}

/** 客户/联系人可见范围：销售本人负责；销管筛销售时按该销售；否则全部 */
function resolveCustomerScope(
  role: UserRole,
  sessionUserId: string,
  filterUserId: string | null | undefined
): Prisma.CustomerWhereInput {
  if (!canManageCustomerOwner(role)) {
    return customerResponsibleWhere(sessionUserId);
  }
  if (filterUserId?.trim()) {
    return customerResponsibleWhere(filterUserId.trim());
  }
  return {};
}

function resolveOpportunityScope(
  role: UserRole,
  sessionUserId: string,
  filterUserId: string | null | undefined
): Prisma.OpportunityWhereInput {
  if (!canViewAllOpportunities(role)) {
    return { ownerId: sessionUserId };
  }
  if (filterUserId?.trim()) {
    return { ownerId: filterUserId.trim() };
  }
  return {};
}

function resolveContractScope(
  role: UserRole,
  sessionUserId: string,
  filterUserId: string | null | undefined
): Prisma.ContractWhereInput {
  if (!canViewAllDailyReports(role)) {
    return { ownerId: sessionUserId };
  }
  if (filterUserId?.trim()) {
    return { ownerId: filterUserId.trim() };
  }
  return {};
}

function pickMatchedField(
  q: string,
  fields: Array<{ label: string; value: string | null | undefined }>
) {
  const needle = q.toLowerCase();
  for (const field of fields) {
    const value = field.value?.trim();
    if (!value) continue;
    if (value.toLowerCase().includes(needle)) {
      return { label: field.label, value };
    }
  }
  const first = fields.find((f) => f.value?.trim());
  return first
    ? { label: first.label, value: first.value!.trim() }
    : { label: "", value: "" };
}

export async function searchSalesActivityByKeyword(
  role: UserRole,
  sessionUserId: string,
  input: ActivitySearchParams,
  now = new Date()
): Promise<ActivitySearchResult | null> {
  const q = normalizeActivitySearchQuery(input.q);
  if (!q) return null;

  const defaults = defaultActivitySearchRange(now);
  const fromDate = parseActivitySearchDay(input.from) ?? defaults.from;
  let toDate = parseActivitySearchDay(input.to) ?? defaults.to;
  if (toDate.getTime() < fromDate.getTime()) {
    toDate = fromDate;
  }

  const fromStart = startOfDay(fromDate);
  const toEnd = endOfDay(toDate);
  const userScope = resolveUserScope(role, sessionUserId, input.userId);
  const customerScope = resolveCustomerScope(role, sessionUserId, input.userId);
  const opportunityScope = resolveOpportunityScope(role, sessionUserId, input.userId);
  const contractScope = resolveContractScope(role, sessionUserId, input.userId);

  const [
    dailyRows,
    followUpRows,
    customerRows,
    contactRows,
    opportunityRows,
    contractRows,
  ] = await Promise.all([
    prisma.salesDailyLog.findMany({
      where: {
        ...userScope,
        logDate: { gte: fromStart, lte: toEnd },
        NOT: { dailyReport: UNSUBMITTED_DAILY_REPORT_BODY },
        OR: [
          { dailyReport: { contains: q } },
          { followUps: { some: { customer: { name: { contains: q } } } } },
          {
            followUps: {
              some: {
                OR: [
                  { contact: { name: { contains: q } } },
                  { linkedContacts: { some: { contact: { name: { contains: q } } } } },
                  { opportunity: { title: { contains: q } } },
                  {
                    linkedOpportunities: {
                      some: { opportunity: { title: { contains: q } } },
                    },
                  },
                ],
              },
            },
          },
          { checkIns: { some: { customer: { name: { contains: q } } } } },
          { checkIns: { some: { contact: { name: { contains: q } } } } },
        ],
      },
      orderBy: { logDate: "desc" },
      take: ACTIVITY_SEARCH_LIMIT + 1,
      select: {
        id: true,
        logDate: true,
        dailyReport: true,
        userId: true,
        user: { select: { id: true, name: true } },
        followUps: {
          select: { customer: { select: { name: true } } },
          orderBy: { followUpAt: "asc" },
        },
        checkIns: {
          where: { customerId: { not: null } },
          select: { customer: { select: { name: true } } },
          orderBy: { checkedInAt: "asc" },
        },
      },
    }),
    prisma.followUp.findMany({
      where: {
        ...userScope,
        followUpAt: { gte: fromStart, lte: toEnd },
        OR: [
          { content: { contains: q } },
          { result: { contains: q } },
          { nextFollowUpContent: { contains: q } },
          { customer: { name: { contains: q } } },
          { contact: { name: { contains: q } } },
          { linkedContacts: { some: { contact: { name: { contains: q } } } } },
          { opportunity: { title: { contains: q } } },
          {
            linkedOpportunities: {
              some: { opportunity: { title: { contains: q } } },
            },
          },
        ],
      },
      orderBy: { followUpAt: "desc" },
      take: ACTIVITY_SEARCH_LIMIT + 1,
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
        contact: { select: { id: true, name: true } },
        linkedContacts: {
          select: { contact: { select: { id: true, name: true } } },
        },
        opportunity: { select: { id: true, title: true } },
        linkedOpportunities: {
          select: { opportunity: { select: { id: true, title: true } } },
        },
      },
    }),
    // 档案不限日期区间：方便按医院名/联系人直接定位
    prisma.customer.findMany({
      where: {
        AND: [
          customerScope,
          {
            OR: [
              { name: { contains: q } },
              { notes: { contains: q } },
              { province: { contains: q } },
              { city: { contains: q } },
              { district: { contains: q } },
              { existingSystem: { contains: q } },
              { source: { contains: q } },
              { tags: { some: { tagValue: { contains: q } } } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: ACTIVITY_SEARCH_ENTITY_LIMIT + 1,
      select: {
        id: true,
        name: true,
        notes: true,
        province: true,
        city: true,
        district: true,
        existingSystem: true,
        source: true,
        updatedAt: true,
        owner: { select: { id: true, name: true } },
        tags: { select: { tagValue: true }, take: 8 },
      },
    }),
    prisma.contact.findMany({
      where: {
        customer: customerScope,
        OR: [
          { name: { contains: q } },
          { title: { contains: q } },
          { department: { contains: q } },
          { phone: { contains: q } },
          { wechat: { contains: q } },
          { email: { contains: q } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: ACTIVITY_SEARCH_ENTITY_LIMIT + 1,
      select: {
        id: true,
        name: true,
        title: true,
        department: true,
        phone: true,
        wechat: true,
        email: true,
        updatedAt: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
            owner: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.opportunity.findMany({
      where: {
        AND: [
          opportunityScope,
          {
            OR: [
              { title: { contains: q } },
              { requirementDesc: { contains: q } },
              { competitor: { contains: q } },
              { notes: { contains: q } },
              { customer: { name: { contains: q } } },
              { parties: { some: { customer: { name: { contains: q } } } } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: ACTIVITY_SEARCH_ENTITY_LIMIT + 1,
      select: {
        id: true,
        title: true,
        requirementDesc: true,
        competitor: true,
        notes: true,
        updatedAt: true,
        owner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        parties: {
          select: { customer: { select: { name: true } } },
          take: 5,
        },
      },
    }),
    prisma.contract.findMany({
      where: {
        AND: [
          contractScope,
          {
            OR: [
              { title: { contains: q } },
              { contractNo: { contains: q } },
              { notes: { contains: q } },
              { signCustomer: { name: { contains: q } } },
              { endUserCustomer: { name: { contains: q } } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: ACTIVITY_SEARCH_ENTITY_LIMIT + 1,
      select: {
        id: true,
        title: true,
        contractNo: true,
        notes: true,
        updatedAt: true,
        owner: { select: { id: true, name: true } },
        signCustomer: { select: { id: true, name: true } },
        endUserCustomer: { select: { id: true, name: true } },
      },
    }),
  ]);

  const dailyTruncated = dailyRows.length > ACTIVITY_SEARCH_LIMIT;
  const followTruncated = followUpRows.length > ACTIVITY_SEARCH_LIMIT;
  const entityTruncated =
    customerRows.length > ACTIVITY_SEARCH_ENTITY_LIMIT ||
    contactRows.length > ACTIVITY_SEARCH_ENTITY_LIMIT ||
    opportunityRows.length > ACTIVITY_SEARCH_ENTITY_LIMIT ||
    contractRows.length > ACTIVITY_SEARCH_ENTITY_LIMIT;
  const dailySlice = dailyRows.slice(0, ACTIVITY_SEARCH_LIMIT);

  const dayUserKeys = dailySlice.map((row) => ({
    userId: row.userId,
    dayStart: startOfDay(row.logDate),
    dayEnd: endOfDay(row.logDate),
  }));
  const sameDayCustomers =
    dayUserKeys.length === 0
      ? []
      : await prisma.followUp.findMany({
          where: {
            OR: dayUserKeys.map((k) => ({
              userId: k.userId,
              followUpAt: { gte: k.dayStart, lte: k.dayEnd },
            })),
          },
          select: {
            userId: true,
            followUpAt: true,
            customer: { select: { name: true } },
          },
        });
  const customersByDayUser = new Map<string, Set<string>>();
  for (const row of dailySlice) {
    const key = `${row.userId}:${dayKey(row.logDate)}`;
    const set = customersByDayUser.get(key) ?? new Set<string>();
    for (const f of row.followUps) set.add(f.customer.name);
    for (const c of row.checkIns) {
      if (c.customer?.name) set.add(c.customer.name);
    }
    customersByDayUser.set(key, set);
  }
  for (const f of sameDayCustomers) {
    const key = `${f.userId}:${dayKey(f.followUpAt)}`;
    const set = customersByDayUser.get(key) ?? new Set<string>();
    set.add(f.customer.name);
    customersByDayUser.set(key, set);
  }

  const dailyLogs: ActivitySearchHit[] = dailySlice.map((row) => {
    const date = dayKey(row.logDate);
    const body = row.dailyReport?.trim() ?? "";
    const fromActivity = [
      ...(customersByDayUser.get(`${row.userId}:${date}`) ?? new Set<string>()),
    ];
    const fromText = extractCustomerNamesFromDailyReport(body);
    const uniqueCustomers: string[] = [];
    const seen = new Set<string>();
    for (const name of [...fromActivity, ...fromText]) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCustomers.push(name);
    }
    const snippetSource =
      body.toLowerCase().includes(q.toLowerCase())
        ? body
        : uniqueCustomers.some((n) => n.toLowerCase().includes(q.toLowerCase()))
          ? `关联客户：${formatCustomerLabel(uniqueCustomers) ?? ""}${body ? ` · ${body}` : ""}`
          : body || formatCustomerLabel(uniqueCustomers) || "有关联记录";
    return {
      kind: "daily_log",
      id: row.id,
      at: row.logDate,
      userId: row.user.id,
      userName: row.user.name,
      title: `日报 · ${date}`,
      snippet: buildKeywordSnippet(snippetSource, q),
      href: `/daily-reports?date=${date}&userId=${row.userId}`,
      meta: formatCustomerLabel(uniqueCustomers),
    };
  });

  const followUps: ActivitySearchHit[] = followUpRows
    .slice(0, ACTIVITY_SEARCH_LIMIT)
    .map((row) => {
      const contactNames = [
        ...new Set(
          [
            row.contact?.name,
            ...row.linkedContacts.map((l) => l.contact.name),
          ].filter((n): n is string => Boolean(n?.trim()))
        ),
      ];
      const oppTitles = [
        ...new Set(
          [
            row.opportunity?.title,
            ...row.linkedOpportunities.map((l) => l.opportunity.title),
          ].filter((t): t is string => Boolean(t?.trim()))
        ),
      ];
      const joined = [row.content, row.result, row.nextFollowUpContent]
        .filter((s): s is string => Boolean(s?.trim()))
        .join(" / ");
      const extras = [
        contactNames.length ? `联系人：${contactNames.join("、")}` : null,
        oppTitles.length ? `商机：${oppTitles.join("、")}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const matchedOnEntity =
        row.customer.name.toLowerCase().includes(q.toLowerCase()) ||
        contactNames.some((n) => n.toLowerCase().includes(q.toLowerCase())) ||
        oppTitles.some((t) => t.toLowerCase().includes(q.toLowerCase()));
      const snippetSource =
        matchedOnEntity && !joined.toLowerCase().includes(q.toLowerCase())
          ? `${extras || `客户：${row.customer.name}`}${joined ? ` · ${joined}` : ""}`
          : [joined, extras].filter(Boolean).join(" · ") || row.customer.name;
      return {
        kind: "follow_up" as const,
        id: row.id,
        at: row.followUpAt,
        userId: row.user.id,
        userName: row.user.name,
        title: row.customer.name,
        snippet: buildKeywordSnippet(snippetSource, q),
        href: `/customers/${row.customerId}/follow-ups`,
        meta: [salesLogMethodLabel(row.method), contactNames[0] ? `联系人 ${contactNames[0]}` : null]
          .filter(Boolean)
          .join(" · "),
      };
    });

  const customers: ActivitySearchHit[] = customerRows
    .slice(0, ACTIVITY_SEARCH_ENTITY_LIMIT)
    .map((row) => {
      const region = [row.province, row.city, row.district].filter(Boolean).join("");
      const matched = pickMatchedField(q, [
        { label: "名称", value: row.name },
        { label: "备注", value: row.notes },
        { label: "地区", value: region },
        { label: "现有系统", value: row.existingSystem },
        { label: "来源", value: row.source },
        { label: "标签", value: row.tags.map((t) => t.tagValue).join("、") },
      ]);
      return {
        kind: "customer" as const,
        id: row.id,
        at: row.updatedAt,
        userId: row.owner?.id ?? "",
        userName: row.owner?.name ?? "公海",
        title: row.name,
        snippet: buildKeywordSnippet(
          matched.value ? `${matched.label}：${matched.value}` : row.name,
          q
        ),
        href: `/customers/${row.id}`,
        meta: region || null,
      };
    });

  const contacts: ActivitySearchHit[] = contactRows
    .slice(0, ACTIVITY_SEARCH_ENTITY_LIMIT)
    .map((row) => {
      const matched = pickMatchedField(q, [
        { label: "姓名", value: row.name },
        { label: "职务", value: row.title },
        { label: "部门", value: row.department },
        { label: "手机", value: row.phone },
        { label: "微信", value: row.wechat },
        { label: "邮箱", value: row.email },
      ]);
      const detail = [row.title, row.department, row.phone].filter(Boolean).join(" · ");
      return {
        kind: "contact" as const,
        id: row.id,
        at: row.updatedAt,
        userId: row.customer.owner?.id ?? "",
        userName: row.customer.owner?.name ?? "公海",
        title: row.name,
        snippet: buildKeywordSnippet(
          `${row.customer.name}${matched.value ? ` · ${matched.label}：${matched.value}` : ""}${
            detail ? ` · ${detail}` : ""
          }`,
          q
        ),
        href: `/customers/${row.customerId}`,
        meta: row.customer.name,
      };
    });

  const opportunities: ActivitySearchHit[] = opportunityRows
    .slice(0, ACTIVITY_SEARCH_ENTITY_LIMIT)
    .map((row) => {
      const partyNames = row.parties.map((p) => p.customer.name);
      const matched = pickMatchedField(q, [
        { label: "标题", value: row.title },
        { label: "客户", value: row.customer?.name },
        { label: "关联客户", value: partyNames.join("、") },
        { label: "需求", value: row.requirementDesc },
        { label: "对手", value: row.competitor },
        { label: "备注", value: row.notes },
      ]);
      return {
        kind: "opportunity" as const,
        id: row.id,
        at: row.updatedAt,
        userId: row.owner.id,
        userName: row.owner.name,
        title: row.title,
        snippet: buildKeywordSnippet(
          matched.value ? `${matched.label}：${matched.value}` : row.title,
          q
        ),
        href: `/opportunities/${row.id}`,
        meta: row.customer?.name ?? partyNames[0] ?? null,
      };
    });

  const contracts: ActivitySearchHit[] = contractRows
    .slice(0, ACTIVITY_SEARCH_ENTITY_LIMIT)
    .map((row) => {
      const matched = pickMatchedField(q, [
        { label: "标题", value: row.title },
        { label: "合同号", value: row.contractNo },
        { label: "签约客户", value: row.signCustomer.name },
        { label: "终端客户", value: row.endUserCustomer.name },
        { label: "备注", value: row.notes },
      ]);
      return {
        kind: "contract" as const,
        id: row.id,
        at: row.updatedAt,
        userId: row.owner.id,
        userName: row.owner.name,
        title: row.title,
        snippet: buildKeywordSnippet(
          matched.value ? `${matched.label}：${matched.value}` : row.title,
          q
        ),
        href: `/contracts/${row.id}`,
        meta: row.signCustomer.name,
      };
    });

  return {
    q,
    from: dayKey(fromStart),
    to: dayKey(toDate),
    userId: userScope.userId ?? null,
    dailyLogs,
    followUps,
    customers,
    contacts,
    opportunities,
    contracts,
    truncated: dailyTruncated || followTruncated || entityTruncated,
    mode: "keyword",
  };
}
