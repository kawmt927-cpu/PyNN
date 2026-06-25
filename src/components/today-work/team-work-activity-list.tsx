import Link from "next/link";
import { format } from "date-fns";
import type { TeamWorkActivityItem, TeamWorkDayGroup } from "@/lib/today-work/team-work-activity";
import { kindLabel } from "@/lib/today-work/team-work-activity";

function kindBadgeClass(kind: TeamWorkActivityItem["kind"]) {
  if (kind === "check_in") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  }
  if (kind === "follow_up") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
}

function ActivityRow({ item }: { item: TeamWorkActivityItem }) {
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass(item.kind)}`}>
              {kindLabel(item.kind)}
            </span>
            <span className="font-medium text-foreground">{item.userName}</span>
            <span className="text-muted-foreground">·</span>
            {item.customerId ? (
              <Link href={`/customers/${item.customerId}`} className="font-medium text-primary hover:underline">
                {item.title}
              </Link>
            ) : (
              <span className="font-medium">{item.title}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{item.subtitle}</p>
          {item.detail ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">{item.detail}</p>
          ) : null}
          {item.meta ? <p className="text-xs text-muted-foreground">{item.meta}</p> : null}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {format(item.at, item.kind === "daily_log" ? "MM-dd HH:mm" : "HH:mm")}
        </span>
      </div>
    </li>
  );
}

export function TeamWorkActivityFlatList({ items }: { items: TeamWorkActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">该时段暂无工作记录。</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
      ))}
    </ul>
  );
}

export function TeamWorkActivityGroupedList({ groups }: { groups: TeamWorkDayGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">该时段暂无工作记录。</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.dayKey} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h3 className="text-sm font-semibold">{group.dayLabel}</h3>
            <p className="text-xs text-muted-foreground">
              打卡 {group.stats.checkIns} · 往来 {group.stats.followUps} · 日报{" "}
              {group.stats.logsSubmitted}
            </p>
          </div>
          {group.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">当日无记录</p>
          ) : (
            <ul className="space-y-3">
              {group.items.map((item) => (
                <ActivityRow key={`${group.dayKey}-${item.kind}-${item.id}`} item={item} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
