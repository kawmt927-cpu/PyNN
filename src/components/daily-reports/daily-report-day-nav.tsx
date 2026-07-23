"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DailyReportDatePicker } from "@/components/daily-reports/daily-report-date-picker";
import { buildDailyReportDayHref } from "@/lib/sales-log/daily-report-day";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SalesOption = { id: string; name: string };

type Props = {
  date: string;
  prevDate: string;
  nextDate: string;
  canGoNext: boolean;
  isToday: boolean;
  userId: string;
  maxDate: string;
  markedDates?: string[];
  showUserFilter?: boolean;
  salesUsers?: SalesOption[];
  /** 默认 /daily-reports；手机端传 /mobile/reports */
  basePath?: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DailyReportDayNav({
  date,
  prevDate,
  nextDate,
  canGoNext,
  isToday,
  userId,
  maxDate,
  markedDates = [],
  showUserFilter,
  salesUsers = [],
  basePath = "/daily-reports",
}: Props) {
  const router = useRouter();

  function navigate(next: { date: string; userId: string }) {
    router.push(buildDailyReportDayHref(next, basePath));
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid gap-4",
          showUserFilter
            ? "sm:grid-cols-[minmax(0,220px)_minmax(0,200px)]"
            : "max-w-[200px]"
        )}
      >
        {showUserFilter ? (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="dr-day-user" className="text-xs text-muted-foreground">
              销售
            </Label>
            <select
              id="dr-day-user"
              value={userId}
              className={selectClassName}
              onChange={(e) => navigate({ date, userId: e.target.value })}
            >
              {salesUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <DailyReportDatePicker
          key={userId}
          value={date}
          maxDate={maxDate}
          userId={userId}
          initialMarkedDates={markedDates}
          markLegendLabel={
            showUserFilter ? "该销售当日有日报或工作记录" : "当日有日报或工作记录"
          }
          onChange={(nextDate) => navigate({ date: nextDate, userId })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 min-w-[92px] px-3"
          onClick={() => navigate({ date: prevDate, userId })}
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span>上一天</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 min-w-[92px] px-3"
          disabled={!canGoNext}
          onClick={() => {
            if (canGoNext) navigate({ date: nextDate, userId });
          }}
        >
          <span>下一天</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 min-w-[56px] px-3"
          disabled={isToday}
          onClick={() => {
            if (!isToday) navigate({ date: formatTodayLocal(), userId });
          }}
        >
          今天
        </Button>
      </div>
    </div>
  );
}

function formatTodayLocal() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
