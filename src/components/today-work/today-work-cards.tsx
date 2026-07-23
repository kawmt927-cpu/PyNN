"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, MapPinned } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckInDialogProvider } from "@/components/today-work/check-in-dialog-context";
import { cn } from "@/lib/utils";
import type { SalesDailyLogStatus } from "@prisma/client";

const dailyLogStatusLabel: Record<SalesDailyLogStatus, string> = {
  IN_PROGRESS: "进行中",
  PENDING_CONFIRM: "待确认",
  SUBMITTED: "已提交",
  RISK_SUBMITTED: "已提交（有风险）",
};

type ActionCardProps = {
  title: string;
  hint: string;
  icon: ReactNode;
  accentClass: string;
  onClick: () => void;
  children: ReactNode;
};

function TodayWorkActionCard({
  title,
  hint,
  icon,
  accentClass,
  onClick,
  children,
}: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-full w-full gap-4 rounded-xl border-2 border-dashed p-4 text-left transition-all",
        "border-muted-foreground/20 bg-card hover:border-primary/60 hover:bg-primary/5 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors",
          accentClass,
          "group-hover:scale-105"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden
          />
        </div>
        <div className="mt-1 flex-1">{children}</div>
        <p className="mt-3 text-xs font-medium text-primary/80 group-hover:text-primary">
          {hint}
        </p>
      </div>
    </button>
  );
}

type Props = {
  pendingCheckIns: number;
  checkInCount: number;
  todayFollowUpCount: number;
  dailyLogStatus: SalesDailyLogStatus | null;
  checkInContent: ReactNode;
};

export function TodayWorkCards({
  pendingCheckIns,
  checkInCount,
  todayFollowUpCount,
  dailyLogStatus,
  checkInContent,
}: Props) {
  const router = useRouter();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const logLabel = dailyLogStatus ? dailyLogStatusLabel[dailyLogStatus] : "未开始";

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">点击下方卡片打开对应功能</p>
        <div className="grid items-stretch gap-3 sm:grid-cols-2">
          <TodayWorkActionCard
            title="往来打卡"
            hint="点击进入 · 定位打卡与往来记录"
            accentClass="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            icon={<MapPinned className="h-6 w-6" aria-hidden />}
            onClick={() => setCheckInOpen(true)}
          >
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold tabular-nums">{todayFollowUpCount}</p>
                <p className="text-xs text-muted-foreground">今日往来</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{checkInCount}</p>
                <p className="text-xs text-muted-foreground">
                  今日打卡
                  {pendingCheckIns > 0 ? (
                    <span className="text-orange-600"> · {pendingCheckIns} 条待完善</span>
                  ) : null}
                </p>
              </div>
            </div>
          </TodayWorkActionCard>

          <TodayWorkActionCard
            title="今日日报"
            hint="点击进入 · 与 AI 助理整理并提交日报"
            accentClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            icon={<ClipboardList className="h-6 w-6" aria-hidden />}
            onClick={() => router.push("/today-work/daily-log")}
          >
            <p
              className={cn(
                "text-2xl font-bold leading-none",
                dailyLogStatus === "SUBMITTED" || dailyLogStatus === "RISK_SUBMITTED"
                  ? "text-green-600"
                  : dailyLogStatus === "IN_PROGRESS" || dailyLogStatus === "PENDING_CONFIRM"
                    ? "text-orange-600"
                    : ""
              )}
            >
              {logLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">日报状态</p>
          </TodayWorkActionCard>
        </div>
      </div>

      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent
          className="max-w-4xl"
          showCloseButton
          scrollable
          closeOnOutsideClick={false}
          closeOnEscape={false}
        >
          <CheckInDialogProvider onClose={() => setCheckInOpen(false)}>
            <DialogHeader>
              <DialogTitle>往来打卡</DialogTitle>
              <DialogDescription>
                无客户打卡仅记录定位；往来打卡可仅打卡后由 AI 补全，也可当场录入往来。
              </DialogDescription>
            </DialogHeader>
            {checkInContent}
          </CheckInDialogProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}
