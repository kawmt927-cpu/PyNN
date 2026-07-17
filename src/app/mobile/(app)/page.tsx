import Link from "next/link";
import { format } from "date-fns";
import { ClipboardList, MapPinned, NotebookPen, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { listMyTodayCheckIns, checkInRequiresFollowUp } from "@/lib/sales-log/check-in";
import { getTodayDailyLogForUser } from "@/lib/sales-log/daily-log";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { cn } from "@/lib/utils";

const DAILY_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "对话中",
  PENDING_CONFIRM: "待确认",
  SUBMITTED: "已提交",
  RISK_SUBMITTED: "已提交",
};

export default async function MobileHomePage() {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const userId = session.user.id;
  const role = session.user.role;
  const now = new Date();

  const [checkIns, dailyLog, upcoming, dueFollowUps] = await Promise.all([
    listMyTodayCheckIns(userId),
    getTodayDailyLogForUser(userId),
    listUpcomingActionsThisWeek(role, userId, 30),
    getPendingFollowUps(role, userId, "due", now, 50),
  ]);

  const pendingCheckIns = checkIns.filter((row) => checkInRequiresFollowUp(row)).length;
  const dailyLabel = dailyLog?.status
    ? DAILY_STATUS_LABEL[dailyLog.status] ?? dailyLog.status
    : "未开始";
  const weekTodoCount = upcoming.items.length;
  const dueCount = dueFollowUps.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs text-muted-foreground">{format(now, "M月d日 EEEE")}</p>
        <h1 className="text-lg font-bold">你好，{session.user.name}</h1>
        <p className="text-xs text-muted-foreground">外勤打卡 · 日报 · 待办查阅</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 pb-6">
        <Link
          href="/mobile/check-in"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <MapPinned className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">往来打卡</span>
            <span className="text-xs text-muted-foreground">
              今日 {checkIns.length} 次
              {pendingCheckIns > 0 ? ` · ${pendingCheckIns} 待补往来` : ""}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/mobile/log"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <NotebookPen className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">今日日报</span>
            <span
              className={cn(
                "text-xs",
                dailyLog?.status === "SUBMITTED" || dailyLog?.status === "RISK_SUBMITTED"
                  ? "text-emerald-600"
                  : "text-muted-foreground"
              )}
            >
              {dailyLabel}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/mobile/tasks"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">待办</span>
            <span className="text-xs text-muted-foreground">
              本周 {weekTodoCount} 项
              {dueCount > 0 ? ` · ${dueCount} 已到期` : ""}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          客户、商机、合同可在「更多」中查阅。复杂新建与编辑请使用电脑端。
        </div>
      </div>
    </div>
  );
}
