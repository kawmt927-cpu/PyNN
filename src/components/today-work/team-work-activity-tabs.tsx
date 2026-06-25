"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TeamActivityView } from "@/lib/today-work/activity-view-scope";

type SalesUser = { id: string; name: string };

function buildUrl(view: TeamActivityView, salesUserId: string | null) {
  const params = new URLSearchParams(window.location.search);
  params.set("activityView", view);
  if (salesUserId) {
    params.set("salesUserId", salesUserId);
  } else {
    params.delete("salesUserId");
  }
  return `/today-work?${params.toString()}`;
}

export function TeamWorkActivityTabs({ view }: { view: TeamActivityView }) {
  const router = useRouter();

  function switchView(next: TeamActivityView) {
    const salesUserId = new URLSearchParams(window.location.search).get("salesUserId");
    router.replace(buildUrl(next, salesUserId && salesUserId !== "all" ? salesUserId : null), {
      scroll: false,
    });
  }

  const tabs: { id: TeamActivityView; label: string }[] = [
    { id: "day", label: "今日" },
    { id: "week", label: "本周" },
    { id: "history", label: "历史" },
  ];

  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => switchView(tab.id)}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            view === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TeamSalesUserSelect({
  value,
  salesUsers,
}: {
  value: string | null;
  salesUsers: SalesUser[];
}) {
  const router = useRouter();

  function onChange(next: string) {
    const view = (new URLSearchParams(window.location.search).get("activityView") ??
      "day") as TeamActivityView;
    router.replace(buildUrl(view, next === "all" ? null : next), { scroll: false });
  }

  return (
    <div className="space-y-2 min-w-[160px]">
      <label htmlFor="team-sales-user" className="text-sm font-medium leading-none">
        查看销售
      </label>
      <select
        id="team-sales-user"
        value={value ?? "all"}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="all">全员</option>
        {salesUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
  );
}
