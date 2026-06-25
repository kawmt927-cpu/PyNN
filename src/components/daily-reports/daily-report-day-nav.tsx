"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildDailyReportDayHref } from "@/lib/sales-log/daily-report-day";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SalesOption = { id: string; name: string };

type Props = {
  date: string;
  prevDate: string;
  nextDate: string;
  canGoNext: boolean;
  isToday: boolean;
  userId: string;
  showUserFilter?: boolean;
  salesUsers?: SalesOption[];
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
  showUserFilter,
  salesUsers = [],
}: Props) {
  const router = useRouter();

  function navigate(next: { date: string; userId: string }) {
    router.push(buildDailyReportDayHref(next));
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9 px-3" asChild>
          <Link
            href={buildDailyReportDayHref({ date: prevDate, userId })}
            className="inline-flex items-center gap-1 whitespace-nowrap"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span>上一天</span>
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-3"
          disabled={!canGoNext}
          asChild={canGoNext}
        >
          {canGoNext ? (
            <Link
              href={buildDailyReportDayHref({ date: nextDate, userId })}
              className="inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>下一天</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </Link>
          ) : (
            <>
              <span>下一天</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </>
          )}
        </Button>
        {!isToday ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 px-3" asChild>
            <Link href={buildDailyReportDayHref({ date: formatTodayLocal(), userId })}>今天</Link>
          </Button>
        ) : null}
      </div>

      <div className="min-w-[160px] flex-1 space-y-1.5 sm:max-w-[200px]">
        <Label htmlFor="dr-day-date" className="text-xs text-muted-foreground">
          日期
        </Label>
        <Input
          id="dr-day-date"
          type="date"
          value={date}
          max={formatTodayLocal()}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            navigate({ date: value, userId });
          }}
        />
      </div>

      {showUserFilter ? (
        <div className="min-w-[160px] flex-1 space-y-1.5 sm:max-w-[220px]">
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
    </div>
  );
}

function formatTodayLocal() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
