"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACTIVITY_SEARCH_MIN_Q,
  type ActivitySearchMode,
} from "@/lib/sales-log/activity-keyword-search";

type SalesOption = { id: string; name: string };

type Props = {
  q: string;
  from: string;
  to: string;
  userId: string;
  mode: ActivitySearchMode;
  showUserFilter: boolean;
  salesUsers: SalesOption[];
  indexedTotal: number;
  embeddingReady: boolean;
  embeddingModel: string | null;
};

export function ActivityKeywordSearchForm({
  q,
  from,
  to,
  userId,
  mode,
  showUserFilter,
  salesUsers,
  indexedTotal,
  embeddingReady,
  embeddingModel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const nextQ = String(form.get("q") ?? "").trim();
    const nextFrom = String(form.get("from") ?? "").trim();
    const nextTo = String(form.get("to") ?? "").trim();
    const nextUser = String(form.get("userId") ?? "").trim();
    const nextMode = String(form.get("mode") ?? "keyword").trim();
    if (nextQ) params.set("q", nextQ);
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    if (nextUser) params.set("userId", nextUser);
    if (nextMode && nextMode !== "keyword") params.set("mode", nextMode);
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/daily-reports/search?${qs}` : "/daily-reports/search");
    });
  }

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="activity-search-q">关键字 / 语义描述</Label>
          <Input
            id="activity-search-q"
            name="q"
            defaultValue={q}
            placeholder={
              mode === "semantic"
                ? `如「预算不足」（至少 ${ACTIVITY_SEARCH_MIN_Q} 字）`
                : `医院名、联系人、商机…（至少 ${ACTIVITY_SEARCH_MIN_Q} 字）`
            }
            className="h-10 w-[280px]"
            disabled={pending}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="activity-search-mode">模式</Label>
          <select
            id="activity-search-mode"
            name="mode"
            defaultValue={mode}
            disabled={pending}
            className="flex h-10 w-[120px] rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="keyword">关键字</option>
            <option value="semantic">语义</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="activity-search-from">从</Label>
          <Input
            id="activity-search-from"
            name="from"
            type="date"
            defaultValue={from}
            className="h-10 w-[150px]"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="activity-search-to">到</Label>
          <Input
            id="activity-search-to"
            name="to"
            type="date"
            defaultValue={to}
            className="h-10 w-[150px]"
            disabled={pending}
          />
        </div>
        {showUserFilter ? (
          <div className="space-y-1">
            <Label htmlFor="activity-search-user">销售</Label>
            <select
              id="activity-search-user"
              name="userId"
              defaultValue={userId}
              disabled={pending}
              className="flex h-10 w-[160px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">全部销售</option>
              {salesUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "搜索中…" : "搜索"}
        </Button>
        {q ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => startTransition(() => router.push("/daily-reports/search"))}
          >
            清空
          </Button>
        ) : null}
      </form>

      <p className="text-xs text-muted-foreground">
        语义索引 {indexedTotal} 条
        {embeddingModel ? ` · ${embeddingModel}` : ""}
        {!embeddingReady ? " · 未配置 Embedding Key" : ""}
        {" · "}
        部署时自动回填，新日志提交后自动更新
      </p>
    </div>
  );
}
