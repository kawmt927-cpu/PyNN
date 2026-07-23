"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveProjectDevSettlement } from "@/app/(dashboard)/plans-tasks/actions";
import type { ProjectDevSettlementItem } from "@/lib/plans-tasks/monthly-kpi";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  userName: string;
  year: number;
  month: number;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ProjectDevSettlementDialog({ userId, userName, year, month }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ProjectDevSettlementItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems(null);
    void fetch(
      `/api/plans-tasks/project-dev-settlement?userId=${encodeURIComponent(userId)}&year=${year}&month=${month}`,
      { credentials: "include" }
    )
      .then(async (res) => {
        const data = (await res.json()) as { items?: ProjectDevSettlementItem[]; error?: string };
        if (!res.ok) throw new Error(data.error || "加载失败");
        if (cancelled) return;
        const nextItems = data.items ?? [];
        setItems(nextItems);
        setSelected(
          new Set(nextItems.filter((item) => item.countedAsProjectDev === true).map((item) => item.id))
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, year, month]);

  const pendingCount = useMemo(
    () => items?.filter((item) => item.countedAsProjectDev == null).length ?? 0,
    [items]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (!items) return;
    setError(null);
    startTransition(async () => {
      const result = await saveProjectDevSettlement({
        userId,
        year,
        month,
        countedLogIds: [...selected],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
          核算
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden p-0" showCloseButton scrollable>
        <div className="space-y-4 p-6">
          <DialogHeader>
            <DialogTitle>项目开发核算</DialogTitle>
            <DialogDescription>
              {userName} · {year} 年 {month} 月。列出当月阶段往前推进的记录，勾选后计入项目开发 KPI。
              {pendingCount > 0 ? ` 待核算 ${pendingCount} 条。` : null}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : error && !items ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : items && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">本月暂无阶段往前推进的商机记录。</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {items?.map((item) => {
                const checked = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors",
                        checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-input"
                        checked={checked}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block font-medium leading-snug">{item.opportunityTitle}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.customerName} · {formatWhen(item.createdAt)}
                        </span>
                        <span className="block text-xs">
                          {item.fromStageLabel}
                          <span className="mx-1 text-muted-foreground">→</span>
                          {item.toStageLabel}
                          {item.countedAsProjectDev == null ? (
                            <span className="ml-2 text-orange-600">待核算</span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {error && items ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={pending || loading || !items}
              onClick={handleSave}
            >
              {pending ? "保存中…" : `保存（计入 ${selected.size}）`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
