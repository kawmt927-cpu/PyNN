import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivitySearchHit, ActivitySearchResult } from "@/lib/sales-log/activity-keyword-search";

function titleClass(kind: ActivitySearchHit["kind"]) {
  if (kind === "follow_up" || kind === "customer" || kind === "contact") {
    return "font-medium text-blue-600 group-hover:underline";
  }
  if (kind === "opportunity" || kind === "contract") {
    return "font-medium text-emerald-700 group-hover:underline dark:text-emerald-400";
  }
  return "font-medium text-foreground group-hover:underline";
}

function HitList({
  title,
  empty,
  hits,
  showUser,
  note,
}: {
  title: string;
  empty: string;
  hits: ActivitySearchHit[];
  showUser: boolean;
  note?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {hits.length} 条
          </span>
        </CardTitle>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardHeader>
      <CardContent>
        {hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`} className="py-3 first:pt-0 last:pb-0">
                <Link href={hit.href} className="group block space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={titleClass(hit.kind)}>{hit.title}</span>
                    {hit.meta ? (
                      <span
                        className={
                          hit.kind === "daily_log"
                            ? "text-sm font-medium text-blue-600"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {hit.kind === "daily_log" ? `· ${hit.meta}` : hit.meta}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {format(
                        hit.at,
                        hit.kind === "daily_log" || hit.kind === "follow_up"
                          ? "yyyy-MM-dd HH:mm"
                          : "yyyy-MM-dd"
                      )}
                      {showUser && hit.userName ? ` · ${hit.userName}` : ""}
                      {typeof hit.score === "number"
                        ? ` · 相似度 ${Math.round(hit.score * 100)}%`
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{hit.snippet}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type Props = {
  result: ActivitySearchResult;
  showUser: boolean;
};

function buildSemanticHref(result: ActivitySearchResult) {
  const params = new URLSearchParams();
  params.set("q", result.q);
  params.set("mode", "semantic");
  if (result.from) params.set("from", result.from);
  if (result.to) params.set("to", result.to);
  if (result.userId) params.set("userId", result.userId);
  return `/daily-reports/search?${params.toString()}`;
}

export function ActivityKeywordSearchResults({ result, showUser }: Props) {
  const customers = result.customers ?? [];
  const contacts = result.contacts ?? [];
  const opportunities = result.opportunities ?? [];
  const contracts = result.contracts ?? [];
  const empty =
    result.dailyLogs.length === 0 &&
    result.followUps.length === 0 &&
    customers.length === 0 &&
    contacts.length === 0 &&
    opportunities.length === 0 &&
    contracts.length === 0;
  const suggestSemantic = empty && result.mode !== "semantic";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {result.mode === "semantic" ? "语义" : "关键字"}「{result.q}」· {result.from} 至{" "}
        {result.to}
        {typeof result.indexedTotal === "number"
          ? ` · 索引 ${result.indexedTotal} 条`
          : null}
        {result.truncated ? " · 结果较多，已截断，可缩小时间范围" : null}
      </p>
      {result.warning ? (
        <p className="text-sm text-amber-700">{result.warning}</p>
      ) : null}
      {suggestSemantic ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          关键字模式只匹配原文/档案里的连续字词。「{result.q}」未命中。
          若要按意思查找（例如「无预算」「没批下钱」），请改用{" "}
          <Link
            href={buildSemanticHref(result)}
            className="font-medium text-blue-600 underline underline-offset-2"
          >
            语义搜索
          </Link>
          。
        </p>
      ) : null}
      {result.mode !== "semantic" ? (
        <>
          <HitList
            title="客户"
            empty="无匹配客户档案。"
            hits={customers}
            showUser={showUser}
            note="不限日期 · 名称/地区/备注/标签/现有系统"
          />
          <HitList
            title="联系人"
            empty="无匹配联系人。"
            hits={contacts}
            showUser={showUser}
            note="不限日期 · 姓名/职务/部门/手机/微信"
          />
          <HitList
            title="商机"
            empty="无匹配商机。"
            hits={opportunities}
            showUser={showUser}
            note="不限日期 · 标题/需求/对手/关联客户"
          />
          <HitList
            title="合同"
            empty="无匹配合同。"
            hits={contracts}
            showUser={showUser}
            note="不限日期 · 标题/合同号/签约与终端客户"
          />
        </>
      ) : null}
      <HitList
        title="日报"
        empty="该条件下无匹配日报。"
        hits={result.dailyLogs}
        showUser={showUser}
      />
      <HitList
        title="往来"
        empty="该条件下无匹配往来。"
        hits={result.followUps}
        showUser={showUser}
      />
    </div>
  );
}
