import { format, startOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES, isMobileManagerRole } from "@/lib/mobile/sales-roles";
import {
  formatLogDateParam,
  getTodayLogDate,
  parseActivityDateParam,
} from "@/lib/sales-log/daily-log";
import {
  listTeamWorkActivity,
  summarizeTeamWorkActivity,
} from "@/lib/today-work/team-work-activity";
import { parseActivityOpenParam } from "@/lib/today-work/activity-open";
import { MobileExpandableActivityFeed } from "@/components/today-work/team-work-activity-list";
import { MobileActivityDateNav } from "@/components/mobile/mobile-activity-date-nav";

type Props = {
  searchParams: Promise<{ open?: string; date?: string }>;
};

function serializeActivityItems(
  items: Awaited<ReturnType<typeof listTeamWorkActivity>>
) {
  return items.map((item) => ({
    ...item,
    at: item.at.toISOString(),
    nextFollowUpAt: item.nextFollowUpAt
      ? item.nextFollowUpAt.toISOString()
      : item.nextFollowUpAt ?? null,
  }));
}

export default async function MobileActivityPage({ searchParams }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const query = await searchParams;
  const open = parseActivityOpenParam(query.open);
  const manager = isMobileManagerRole(session.user.role);

  const selectedDay = parseActivityDateParam(query.date);
  const selectedDate = formatLogDateParam(selectedDay);
  const today = getTodayLogDate();
  const isToday = selectedDay.getTime() === today.getTime();

  const start = startOfDay(selectedDay);
  const end = new Date(
    selectedDay.getFullYear(),
    selectedDay.getMonth(),
    selectedDay.getDate() + 1
  );

  const items = await listTeamWorkActivity({
    start,
    end,
    filter: manager ? null : session.user.id,
  });
  const summary = summarizeTeamWorkActivity(items);
  const serialized = serializeActivityItems(items);

  const dayLabel = format(selectedDay, "M月d日 EEEE", { locale: zhCN });
  const title = manager
    ? isToday
      ? "今日团队日志"
      : `${format(selectedDay, "M月d日")}团队日志`
    : isToday
      ? "今日工作日志"
      : `${format(selectedDay, "M月d日")}工作日志`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs text-muted-foreground">{dayLabel}</p>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-xs text-muted-foreground">
          打卡 {summary.checkIns} · 往来 {summary.followUps} · 日报 {summary.logsSubmitted}
          {open ? " · 已定位到推送记录" : ""}
        </p>
        <MobileActivityDateNav
          selectedDate={selectedDate}
          extraQuery={{ open: query.open }}
          className="mt-3"
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6">
        <MobileExpandableActivityFeed
          items={serialized}
          openParam={query.open ?? null}
          previewCount={manager ? 8 : 20}
          currentUserId={session.user.id}
        />
      </div>
    </div>
  );
}
