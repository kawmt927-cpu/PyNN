import Link from "next/link";
import { format } from "date-fns";
import {
  ClipboardList,
  NotebookPen,
  ChevronRight,
  MapPinned,
} from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  SALES_MOBILE_ROLES,
  isMobileManagerRole,
} from "@/lib/mobile/sales-roles";
import { listMyTodayCheckIns, checkInRequiresFollowUp } from "@/lib/sales-log/check-in";
import { listUpcomingActionsThisWeek } from "@/lib/plans-tasks/upcoming-actions";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { getTeamActivityDateRange } from "@/lib/today-work/activity-view-scope";
import {
  listTeamWorkActivity,
  summarizeTeamWorkActivity,
} from "@/lib/today-work/team-work-activity";
import { MobileExpandableActivityFeed } from "@/components/mobile/mobile-expandable-activity-feed";
import { cn } from "@/lib/utils";
import { isDailyReportCountedAsLate } from "@/lib/sales-log/daily-report-submission";

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
  const manager = isMobileManagerRole(role);
  const now = new Date();

  if (manager) {
    const { start, end } = getTeamActivityDateRange("day", now);
    const [upcoming, dueFollowUps, pendingApprovals, activityItems] = await Promise.all([
      listUpcomingActionsThisWeek(role, userId, 30),
      getPendingFollowUps(role, userId, "due", now, 50),
      countPendingApprovals({ id: userId, role }),
      listTeamWorkActivity({ start, end, filter: null }),
    ]);
    const summary = summarizeTeamWorkActivity(activityItems);
    const serialized = activityItems.map((item) => ({
      ...item,
      at: item.at.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt ? item.nextFollowUpAt.toISOString() : null,
    }));

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="text-xs text-muted-foreground">{format(now, "M月d日 EEEE")}</p>
          <h1 className="text-lg font-bold">你好，{session.user.name}</h1>
          <p className="text-xs text-muted-foreground">团队今日动态 · 打卡 / 往来 / 日报</p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-6">
          <div className="grid grid-cols-3 gap-2">
            <Link
              href="/mobile/plans"
              className="rounded-xl border bg-card px-2 py-3 text-center shadow-sm active:bg-muted/60"
            >
              <p className="text-lg font-semibold tabular-nums">{upcoming.items.length}</p>
              <p className="text-[11px] text-muted-foreground">本周待办</p>
            </Link>
            <Link
              href="/mobile/approvals"
              className="rounded-xl border bg-card px-2 py-3 text-center shadow-sm active:bg-muted/60"
            >
              <p className="text-lg font-semibold tabular-nums">{pendingApprovals}</p>
              <p className="text-[11px] text-muted-foreground">待审</p>
            </Link>
            <Link
              href="/mobile/follow-ups"
              className="rounded-xl border bg-card px-2 py-3 text-center shadow-sm active:bg-muted/60"
            >
              <p className="text-lg font-semibold tabular-nums">{dueFollowUps.length}</p>
              <p className="text-[11px] text-muted-foreground">已到期</p>
            </Link>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">今日团队动态</h2>
                <p className="text-xs text-muted-foreground">
                  打卡 {summary.checkIns} · 往来 {summary.followUps} · 已交日报 {summary.logsSubmitted}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/mobile/activity" className="text-xs text-primary">
                  全部日志
                </Link>
                <Link href="/mobile/reports" className="text-xs text-primary">
                  日报管理
                </Link>
              </div>
            </div>
            <MobileExpandableActivityFeed
              items={serialized}
              currentUserId={session.user.id}
            />
          </section>
        </div>
      </div>
    );
  }

  const [checkIns, dailyLog, upcoming, dueFollowUps] = await Promise.all([
    listMyTodayCheckIns(userId),
    prisma.salesDailyLog.findUnique({
      where: {
        userId_logDate: {
          userId,
          logDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      select: {
        status: true,
        submittedAt: true,
        updatedAt: true,
        lateMarkedAt: true,
        logDate: true,
      },
    }),
    listUpcomingActionsThisWeek(role, userId, 30),
    getPendingFollowUps(role, userId, "due", now, 50),
  ]);

  const pendingCheckIns = checkIns.filter((row) => checkInRequiresFollowUp(row)).length;
  let dailyLabel = "未开始";
  if (dailyLog) {
    const submitted =
      dailyLog.status === "SUBMITTED" || dailyLog.status === "RISK_SUBMITTED";
    const late = isDailyReportCountedAsLate(dailyLog);
    if (submitted) {
      dailyLabel = late ? "已提交（迟交）" : DAILY_STATUS_LABEL[dailyLog.status] ?? "已提交";
    } else {
      dailyLabel = late ? "未提交（迟交）" : DAILY_STATUS_LABEL[dailyLog.status] ?? dailyLog.status;
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs text-muted-foreground">{format(now, "M月d日 EEEE")}</p>
        <h1 className="text-lg font-bold">你好，{session.user.name}</h1>
        <p className="text-xs text-muted-foreground">外勤打卡 · 日报 · 待办查阅</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 pb-6">
        <Link
          href="/mobile/activity"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">今日工作日志</span>
            <span className="text-xs text-muted-foreground">
              查看打卡、往来与日报（可切换日期）
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/mobile/check-in"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700">
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
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
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
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-700">
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">待办</span>
            <span className="text-xs text-muted-foreground">
              本周 {upcoming.items.length} 项
              {dueFollowUps.length > 0 ? ` · ${dueFollowUps.length} 已到期` : ""}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          客户、商机可在「更多」中新增与查阅；往来打卡内也可快捷新建。电脑端入口在「更多 → 切换到电脑端」。
        </div>
      </div>
    </div>
  );
}
