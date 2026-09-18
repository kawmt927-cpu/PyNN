import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  ACTIVITY_SEARCH_MIN_Q,
  defaultActivitySearchRange,
  normalizeActivitySearchQuery,
  searchSalesActivityByKeyword,
  type ActivitySearchMode,
} from "@/lib/sales-log/activity-keyword-search";
import { searchSalesActivityBySemantic } from "@/lib/sales-log/activity-semantic-search";
import { getActivityEmbeddingStats } from "@/lib/sales-log/activity-embedding-index";
import { getEmbeddingProviderConfig } from "@/lib/search/embeddings";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActivityKeywordSearchForm } from "@/components/daily-reports/activity-keyword-search-form";
import { ActivityKeywordSearchResults } from "@/components/daily-reports/activity-keyword-search-results";

type Props = {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    userId?: string;
    mode?: string;
  }>;
};

function parseMode(raw: string | undefined): ActivitySearchMode {
  return raw === "semantic" ? "semantic" : "keyword";
}

export default async function DailyReportsSearchPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const params = await searchParams;
  const showAll = canViewAllDailyReports(session.user.role);
  const defaults = defaultActivitySearchRange();
  const from = params.from?.trim() || format(defaults.from, "yyyy-MM-dd");
  const to = params.to?.trim() || format(defaults.to, "yyyy-MM-dd");
  const userId = showAll ? params.userId?.trim() || "" : "";
  const mode = parseMode(params.mode);
  const qRaw = params.q?.trim() ?? "";
  const qOk = Boolean(normalizeActivitySearchQuery(qRaw));

  const [salesUsers, provider, embedStats, result] = await Promise.all([
    showAll
      ? prisma.user.findMany({
          where: { role: "SALES", personnelProfile: { enabled: true } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    getEmbeddingProviderConfig(),
    getActivityEmbeddingStats(),
    qOk
      ? mode === "semantic"
        ? searchSalesActivityBySemantic(session.user.role, session.user.id, {
            q: qRaw,
            from,
            to,
            userId: userId || null,
          })
        : searchSalesActivityByKeyword(session.user.role, session.user.id, {
            q: qRaw,
            from,
            to,
            userId: userId || null,
          })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">工作检索</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            关键字可搜客户、联系人、商机、合同、日报与往来
            {showAll ? "（可筛选销售）" : "（仅本人可见范围）"}
            。日报/往来默认最近 90 天；档案类不限日期。语义模式仍针对日报/往来正文。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/daily-reports">返回按日查看</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">搜索条件</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityKeywordSearchForm
            q={qRaw}
            from={from}
            to={to}
            userId={userId}
            mode={mode}
            showUserFilter={showAll}
            salesUsers={salesUsers}
            indexedTotal={embedStats.total}
            embeddingReady={Boolean(provider)}
            embeddingModel={provider?.model ?? null}
          />
          {qRaw && !qOk ? (
            <p className="mt-3 text-sm text-amber-700">
              请输入至少 {ACTIVITY_SEARCH_MIN_Q} 个字再搜索。
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!qRaw ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            关键字：客户/联系人/商机/合同档案 + 日报/往来。语义：按意思找日报与往来正文。
          </CardContent>
        </Card>
      ) : result ? (
        <ActivityKeywordSearchResults result={result} showUser={showAll} />
      ) : null}
    </div>
  );
}
