"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { format, startOfDay, startOfMonth, subDays, subMonths, endOfMonth } from "date-fns";

type SalesUser = { id: string; name: string };

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function WorkReviewFilters({
  users,
  userId,
  from,
  to,
}: {
  users: SalesUser[];
  userId: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(next: { userId?: string; from?: string; to?: string }) {
    const params = new URLSearchParams();
    params.set("userId", next.userId ?? userId);
    params.set("from", next.from ?? from);
    params.set("to", next.to ?? to);
    startTransition(() => {
      router.replace(`/admin/stats/work-review?${params.toString()}`);
    });
  }

  function applyPreset(preset: "thisMonth" | "lastMonth" | "last30" | "thisWeek") {
    const today = startOfDay(new Date());
    if (preset === "thisMonth") {
      navigate({ from: ymd(startOfMonth(today)), to: ymd(today) });
      return;
    }
    if (preset === "lastMonth") {
      const last = subMonths(today, 1);
      navigate({ from: ymd(startOfMonth(last)), to: ymd(endOfMonth(last)) });
      return;
    }
    if (preset === "last30") {
      navigate({ from: ymd(subDays(today, 29)), to: ymd(today) });
      return;
    }
    // thisWeek: 周一～今天
    const day = today.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const monday = subDays(today, mondayOffset);
    navigate({ from: ymd(monday), to: ymd(today) });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">销售人员</span>
          <select
            className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={userId}
            disabled={pending || users.length === 0}
            onChange={(e) => navigate({ userId: e.target.value })}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">开始</span>
          <input
            type="date"
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={from}
            disabled={pending}
            onChange={(e) => navigate({ from: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">结束</span>
          <input
            type="date"
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={to}
            disabled={pending}
            onChange={(e) => navigate({ to: e.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["thisMonth", "本月"],
            ["lastMonth", "上月"],
            ["thisWeek", "本周"],
            ["last30", "近30天"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={pending}
            onClick={() => applyPreset(key)}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {label}
          </button>
        ))}
        {pending ? <span className="text-xs text-muted-foreground">加载中…</span> : null}
      </div>
    </div>
  );
}
