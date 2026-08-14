import { tool } from "ai";
import { OpportunityStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMonthlyKpiBundle } from "@/lib/plans-tasks/monthly-kpi";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { listTeamPaymentDueOverview } from "@/lib/contracts/payment-due";
import { getOutstandingArSummary } from "@/lib/contracts/outstanding-ar";
import { getOpportunityVisitSummaries } from "@/lib/opportunities/visit-summary";
import { searchSalesActivityByKeyword } from "@/lib/sales-log/activity-keyword-search";
import { searchSalesActivityBySemantic } from "@/lib/sales-log/activity-semantic-search";
import { ROLE_LABELS } from "@/lib/permissions";
import { format } from "date-fns";

export type ManagerAgentSession = {
  user: { id: string; role: UserRole; name?: string };
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function roleLabel(role: UserRole) {
  return ROLE_LABELS[role] ?? role;
}

async function roleMapByUserIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, { role: UserRole; roleLabel: string }>();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, role: true },
  });
  return new Map(
    rows.map((u) => [u.id, { role: u.role, roleLabel: roleLabel(u.role) }] as const)
  );
}

/** 管理助手可见的销售线启用人员（含角色） */
export async function listManagerVisibleRoster() {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SALES", "SALES_MANAGER", "ADMIN"] },
      personnelProfile: { enabled: true },
    },
    select: {
      id: true,
      name: true,
      role: true,
      includeInMonthlyAssessment: true,
      includeInTeamPerformance: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    role: u.role,
    roleLabel: roleLabel(u.role),
    /** 是否按一线销售考核日报（仅 SALES） */
    dailyReportRequired: u.role === "SALES",
    includeInMonthlyAssessment: u.includeInMonthlyAssessment,
    includeInTeamPerformance: u.includeInTeamPerformance,
  }));
}

export function formatRosterSummaryForPrompt(
  roster: Awaited<ReturnType<typeof listManagerVisibleRoster>>
) {
  if (roster.length === 0) return "（暂无启用人员）";
  const lines = roster.map((u) => {
    const flags: string[] = [];
    if (u.dailyReportRequired) flags.push("需交日报");
    else flags.push("不考核日报");
    return `- ${u.name}｜${u.roleLabel}（${u.role}）${flags.length ? `｜${flags.join("、")}` : ""}`;
  });
  return lines.join("\n");
}

export function createManagerAgentTools(session: ManagerAgentSession) {
  const { role, id: userId } = session.user;

  return {
    listTeamRoster: tool({
      description:
        "列出销售线启用人员及角色（一线销售 / 销管 / 管理员）。回答「谁该交日报」「谁是销管」前应先调用。销管与管理员不考核日报、不以跑客户指标要求本人。",
      parameters: z.object({}),
      execute: async () => {
        const roster = await listManagerVisibleRoster();
        return {
          count: roster.length,
          salesCount: roster.filter((u) => u.role === "SALES").length,
          managerCount: roster.filter((u) => u.role === "SALES_MANAGER").length,
          members: roster,
          note: "dailyReportRequired=true 的才是一线销售日报考核对象；SALES_MANAGER/ADMIN 不应被建议去交日报或当外勤销售考核。",
        };
      },
    }),

    getTeamDailyReportCompliance: tool({
      description:
        "查询**一线销售（角色 SALES）**本月（或指定月）日报过程规范：按时/迟交/缺交。不含销管与管理员——他们不考核日报。用户说「本月」时不要传 year/month，由服务端按 Asia/Shanghai 当前月计算。",
      parameters: z.object({
        year: z
          .number()
          .int()
          .optional()
          .describe("年；仅用户明确指定某年/某月时传入，否则省略（默认上海时区今年）"),
        month: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("月；仅用户明确指定某月时传入，否则省略（默认上海时区本月）。禁止猜测月份。"),
        limit: z.number().int().min(1).max(30).optional().describe("返回人数上限，默认 15"),
      }),
      execute: async ({ year, month, limit }) => {
        const now = new Date();
        // 与业务日一致：用上海时区，避免容器 UTC 或模型乱传月份
        const shanghai = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(now);
        const shanghaiYear = Number(shanghai.find((p) => p.type === "year")?.value);
        const shanghaiMonth = Number(shanghai.find((p) => p.type === "month")?.value);
        const y = year ?? shanghaiYear;
        const m = month ?? shanghaiMonth;
        const take = limit ?? 15;
        // 仅一线销售；与日报催交规则一致
        const members = await prisma.user.findMany({
          where: {
            role: "SALES",
            includeInMonthlyAssessment: true,
            personnelProfile: { enabled: true },
          },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        });
        const rows = await Promise.all(
          members.map(async (u) => {
            const bundle = await getMonthlyKpiBundle(u.id, y, m, now);
            const pc = bundle.actuals.processCompliance;
            return {
              userId: u.id,
              name: u.name,
              role: u.role,
              roleLabel: roleLabel(u.role),
              onTimeCount: pc.onTimeCount,
              lateCount: pc.lateCount,
              missedCount: pc.missedCount,
              href: `/daily-reports?userId=${u.id}`,
            };
          })
        );
        const ranked = rows
          .slice()
          .sort(
            (a, b) =>
              b.lateCount + b.missedCount * 2 - (a.lateCount + a.missedCount * 2) ||
              b.missedCount - a.missedCount ||
              b.lateCount - a.lateCount
          );
        return {
          year: y,
          month: m,
          scope: "仅一线销售 SALES（销管/管理员不考核日报，未计入）",
          memberCount: rows.length,
          totals: {
            lateCount: rows.reduce((s, r) => s + r.lateCount, 0),
            missedCount: rows.reduce((s, r) => s + r.missedCount, 0),
            onTimeCount: rows.reduce((s, r) => s + r.onTimeCount, 0),
          },
          members: ranked.slice(0, take),
          pageHref: "/daily-reports",
        };
      },
    }),

    listPendingFollowUps: tool({
      description:
        "列出逾期待跟进或即将到期的跟进计划。mode=due 逾期；mode=upcoming 未来几天内。",
      parameters: z.object({
        mode: z.enum(["due", "upcoming"]).default("due"),
        withinDays: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("upcoming 时展望天数，默认 7"),
        take: z.number().int().min(1).max(40).optional(),
      }),
      execute: async ({ mode, withinDays, take }) => {
        const now = new Date();
        const limit = take ?? 20;
        const rows = await getPendingFollowUps(role, userId, mode, now, limit, {
          withinDays: mode === "upcoming" ? withinDays ?? 7 : undefined,
        });
        const roles = await roleMapByUserIds(rows.map((r) => r.owner.id));
        return {
          mode,
          count: rows.length,
          items: rows.slice(0, limit).map((r) => {
            const ownerMeta = roles.get(r.owner.id);
            return {
              id: r.id,
              customerName: r.customer.name,
              ownerName: r.owner.name,
              ownerRole: ownerMeta?.role ?? null,
              ownerRoleLabel: ownerMeta?.roleLabel ?? null,
              nextFollowUpAt: dayKey(r.nextFollowUpAt),
              grade: r.customer.customerGrade,
              opportunityTitle: r.opportunity?.title ?? null,
              href: `/customers/${r.customer.id}/follow-ups`,
              note:
                ownerMeta?.role === "SALES"
                  ? "责任人是一线销售，销管可催办"
                  : ownerMeta
                    ? "责任人非一线销售角色，解读时注意职责差异"
                    : null,
            };
          }),
          pageHref: "/follow-ups",
        };
      },
    }),

    listUpcomingActionsThisWeek: tool({
      description: "汇总本周团队待办：跟进、指派任务、催收回款等。",
      parameters: z.object({
        take: z.number().int().min(1).max(40).optional(),
      }),
      execute: async ({ take }) => {
        const { items, week } = await listUpcomingActionsThisWeek(
          role,
          userId,
          take ?? 30
        );
        return {
          weekStart: dayKey(week.weekStart),
          weekEnd: dayKey(week.weekEnd),
          count: items.length,
          items: items.slice(0, take ?? 30).map((it) => {
            if (it.kind === "assignment") {
              return {
                kind: it.kind,
                id: it.id,
                title: it.title,
                subtitle: it.subtitle,
                assigneeName: it.assignee.name,
                dueAt: dayKey(it.dueAt),
                overdue: it.overdue,
                href: "/plans-tasks",
              };
            }
            if (it.kind === "payment_collection") {
              return {
                kind: it.kind,
                id: it.id,
                title: it.title,
                subtitle: it.subtitle,
                assigneeName: it.owner.name,
                dueAt: dayKey(it.dueAt),
                overdue: it.overdue,
                href: `/contracts/${it.contractId}`,
              };
            }
            return {
              kind: it.kind,
              id: it.id,
              title: it.title,
              subtitle: it.subtitle,
              assigneeName: it.owner.name,
              dueAt: dayKey(it.dueAt),
              overdue: it.overdue,
              href: `/customers/${it.customerId}/follow-ups`,
            };
          }),
          pageHref: "/plans-tasks",
        };
      },
    }),

    listFocusOpportunities: tool({
      description:
        "列出重点未签商机（默认 P0/P1），并附上次拜访时间；可筛「超过 N 天未拜访」。",
      parameters: z.object({
        grades: z
          .array(z.string())
          .optional()
          .describe("商机等级，默认 P0、P1"),
        staleDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("只返回超过该天数未拜访的；不传则全部返回"),
        take: z.number().int().min(1).max(40).optional(),
      }),
      execute: async ({ grades, staleDays, take }) => {
        const limit = take ?? 20;
        const gradeList = grades?.length ? grades : ["P0", "P1"];
        const opps = await prisma.opportunity.findMany({
          where: {
            status: OpportunityStatus.NOT_SIGNED,
            grade: { in: gradeList },
          },
          orderBy: [{ grade: "asc" }, { updatedAt: "desc" }],
          take: 80,
          select: {
            id: true,
            title: true,
            grade: true,
            createdAt: true,
            expectedAmount: true,
            expectedCloseDate: true,
            owner: { select: { id: true, name: true, role: true } },
            customer: { select: { id: true, name: true } },
          },
        });
        const visits = await getOpportunityVisitSummaries(
          opps.map((o) => ({ id: o.id, grade: o.grade, createdAt: o.createdAt }))
        );
        const now = Date.now();
        const mapped = opps.map((o) => {
          const v = visits.get(o.id);
          const lastVisitAt = v?.lastVisitAt ?? null;
          const daysSinceVisit = lastVisitAt
            ? Math.floor((now - lastVisitAt.getTime()) / 86_400_000)
            : null;
          return {
            id: o.id,
            title: o.title,
            grade: o.grade,
            expectedAmount: money(Number(o.expectedAmount)),
            expectedCloseDate: dayKey(o.expectedCloseDate),
            ownerName: o.owner.name,
            ownerRole: o.owner.role,
            ownerRoleLabel: roleLabel(o.owner.role),
            customerName: o.customer?.name ?? null,
            lastVisitAt: lastVisitAt ? dayKey(lastVisitAt) : null,
            daysSinceVisit,
            href: `/opportunities/${o.id}`,
            actionHint:
              o.owner.role === "SALES"
                ? "建议销管催该一线销售跟进拜访"
                : "负责人非一线销售，勿按外勤销售标准催其本人跑客户",
          };
        });
        const filtered =
          staleDays != null
            ? mapped.filter(
                (o) => o.daysSinceVisit == null || o.daysSinceVisit >= staleDays
              )
            : mapped;
        filtered.sort(
          (a, b) => (b.daysSinceVisit ?? 9999) - (a.daysSinceVisit ?? 9999)
        );
        return {
          grades: gradeList,
          staleDays: staleDays ?? null,
          count: filtered.length,
          items: filtered.slice(0, limit),
          pageHref: "/opportunities",
        };
      },
    }),

    getPaymentDueOverview: tool({
      description: "按销售负责人汇总合同回款：逾期与即将到期。",
      parameters: z.object({
        take: z.number().int().min(1).max(40).optional(),
      }),
      execute: async ({ take }) => {
        const overview = await listTeamPaymentDueOverview(new Date(), take ?? 30);
        const roles = await roleMapByUserIds(overview.byOwner.map((b) => b.ownerId));
        return {
          overdueCount: overview.overdue.length,
          dueSoonCount: overview.dueSoon.length,
          byOwner: overview.byOwner.map((b) => {
            const meta = roles.get(b.ownerId);
            return {
              ownerName: b.ownerName,
              ownerRole: meta?.role ?? null,
              ownerRoleLabel: meta?.roleLabel ?? null,
              overdueCount: b.overdue.length,
              dueSoonCount: b.dueSoon.length,
              overdueSample: b.overdue.slice(0, 5).map((r) => ({
                contractTitle: r.contractTitle,
                customerName: r.customerName,
                amount: money(r.remainingAmount),
                dueAt: dayKey(r.dueAt),
                href: `/contracts/${r.contractId}`,
              })),
              dueSoonSample: b.dueSoon.slice(0, 3).map((r) => ({
                contractTitle: r.contractTitle,
                customerName: r.customerName,
                amount: money(r.remainingAmount),
                dueAt: dayKey(r.dueAt),
                href: `/contracts/${r.contractId}`,
              })),
            };
          }),
          pageHref: "/contracts",
        };
      },
    }),

    getOutstandingArSummary: tool({
      description: "查询公司应收概况：待收总额、可催收/难催等分段（只读汇总）。",
      parameters: z.object({
        net: z
          .boolean()
          .optional()
          .describe("是否按净待收（扣未作废外部成本），默认 false"),
      }),
      execute: async ({ net }) => {
        const summary = await getOutstandingArSummary({ net: Boolean(net) });
        return {
          net: Boolean(net),
          totalRemaining: money(summary.totalRemaining),
          readyAmount: money(summary.readyAmount),
          difficultAmount: money(summary.difficultAmount),
          pendingAmount: money(summary.pendingAmount),
          awaitingAmount: money(summary.awaitingAmount),
          depositAmount: money(summary.depositAmount),
          pageHref: "/admin/ops",
          contractsHref: "/contracts",
        };
      },
    }),

    searchTeamActivity: tool({
      description:
        "搜索团队日报与往来。mode=keyword 精确子串；mode=semantic 按意思（如「预算不足」可命中「今年无预算」）。",
      parameters: z.object({
        query: z.string().min(2).describe("搜索词或语义描述"),
        mode: z.enum(["keyword", "semantic"]).default("semantic"),
        from: z.string().optional().describe("开始日期 yyyy-MM-dd"),
        to: z.string().optional().describe("结束日期 yyyy-MM-dd"),
        userId: z.string().optional().describe("限定某销售用户 id"),
      }),
      execute: async ({ query, mode, from, to, userId: filterUserId }) => {
        const input = {
          q: query,
          from: from ?? null,
          to: to ?? null,
          userId: filterUserId ?? null,
        };
        const result =
          mode === "keyword"
            ? await searchSalesActivityByKeyword(role, userId, input)
            : await searchSalesActivityBySemantic(role, userId, input);
        if (!result) {
          return { error: "查询词无效（至少 2 个字）" };
        }
        return {
          mode: result.mode ?? mode,
          q: result.q,
          from: result.from,
          to: result.to,
          warning: result.warning ?? null,
          dailyLogCount: result.dailyLogs.length,
          followUpCount: result.followUps.length,
          dailyLogs: result.dailyLogs.slice(0, 8).map((h) => ({
            title: h.title,
            userName: h.userName,
            meta: h.meta,
            snippet: h.snippet,
            score: h.score ?? null,
            href: h.href,
            at: dayKey(h.at),
          })),
          followUps: result.followUps.slice(0, 8).map((h) => ({
            title: h.title,
            userName: h.userName,
            meta: h.meta,
            snippet: h.snippet,
            score: h.score ?? null,
            href: h.href,
            at: dayKey(h.at),
          })),
          pageHref: `/daily-reports/search?q=${encodeURIComponent(query)}&mode=${mode}`,
        };
      },
    }),
  };
}
