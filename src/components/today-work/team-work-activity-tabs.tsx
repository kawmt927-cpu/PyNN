"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  TEAM_ACTIVITY_OTHER_FILTER,
  type TeamActivityUserFilter,
  type TeamActivityView,
} from "@/lib/today-work/activity-view-scope";

type SalesUser = { id: string; name: string };

function buildUrl(view: TeamActivityView, filter: TeamActivityUserFilter) {
  const params = new URLSearchParams(window.location.search);
  params.set("activityView", view);
  if (filter === null) {
    params.delete("salesUserId");
  } else {
    params.set("salesUserId", filter);
  }
  return `/today-work?${params.toString()}`;
}

function readFilterFromUrl(): TeamActivityUserFilter {
  const raw = new URLSearchParams(window.location.search).get("salesUserId");
  if (!raw || raw === "all") return null;
  if (raw === TEAM_ACTIVITY_OTHER_FILTER) return TEAM_ACTIVITY_OTHER_FILTER;
  return raw;
}

export function TeamWorkActivityTabs({ view }: { view: TeamActivityView }) {
  const router = useRouter();

  function switchView(next: TeamActivityView) {
    router.replace(buildUrl(next, readFilterFromUrl()), { scroll: false });
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
  value: TeamActivityUserFilter;
  salesUsers: SalesUser[];
}) {
  const router = useRouter();

  function onChange(next: string) {
    const view = (new URLSearchParams(window.location.search).get("activityView") ??
      "day") as TeamActivityView;
    const filter: TeamActivityUserFilter =
      next === "all" ? null : next === TEAM_ACTIVITY_OTHER_FILTER ? TEAM_ACTIVITY_OTHER_FILTER : next;
    router.replace(buildUrl(view, filter), { scroll: false });
  }

  const selectValue =
    value === null ? "all" : value === TEAM_ACTIVITY_OTHER_FILTER ? TEAM_ACTIVITY_OTHER_FILTER : value;

  return (
    <div className="min-w-[160px] shrink-0 space-y-2">
      <label htmlFor="team-sales-user" className="text-sm font-medium leading-none">
        查看销售
      </label>
      <select
        id="team-sales-user"
        value={selectValue}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="all">全员</option>
        {salesUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
        <option value={TEAM_ACTIVITY_OTHER_FILTER}>其他（销售管理/管理员）</option>
      </select>
    </div>
  );
}
