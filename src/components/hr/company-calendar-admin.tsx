"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  syncCompanyCalendarYearAction,
  upsertCompanyCalendarDayAction,
} from "@/app/(dashboard)/hr/calendar/actions";

type DayRow = {
  dayKey: string;
  kind: "HOLIDAY_OFF" | "MAKEUP_WORKDAY";
  name: string | null;
  source: string;
};

type Props = {
  year: number;
  days: DayRow[];
  syncStatus: string | null;
  syncMessage: string | null;
  syncDayCount: number;
};

export function CompanyCalendarAdmin({
  year,
  days,
  syncStatus,
  syncMessage,
  syncDayCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const byKey = useMemo(() => new Map(days.map((d) => [d.dayKey, d])), [days]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  function setDay(dayKey: string, kind: "HOLIDAY_OFF" | "MAKEUP_WORKDAY" | "CLEAR") {
    const fd = new FormData();
    fd.set("dayKey", dayKey);
    fd.set("kind", kind);
    startTransition(async () => {
      await upsertCompanyCalendarDayAction(fd);
      router.refresh();
    });
  }

  function syncYear() {
    const fd = new FormData();
    fd.set("year", String(year));
    startTransition(async () => {
      await syncCompanyCalendarYearAction(fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="underline" href={`/hr/calendar?year=${year - 1}`}>
          {year - 1}
        </Link>
        <span className="font-semibold">{year} 年</span>
        <Link className="underline" href={`/hr/calendar?year=${year + 1}`}>
          {year + 1}
        </Link>
        <Button size="sm" disabled={pending} onClick={syncYear}>
          从国办源同步本年
        </Button>
        <span className="text-muted-foreground">
          同步状态：{syncStatus ?? "未同步"}
          {syncDayCount ? ` · ${syncDayCount} 天` : ""}
          {syncMessage ? ` · ${syncMessage}` : ""}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {months.map((month) => {
          const daysInMonth = new Date(year, month, 0).getDate();
          return (
            <div key={month} className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">
                {year}-{String(month).padStart(2, "0")}
              </p>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
                {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: (new Date(year, month - 1, 1).getDay() + 6) % 7 }).map(
                  (_, i) => (
                    <div key={`pad-${i}`} />
                  )
                )}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const row = byKey.get(dayKey);
                  const weekday = new Date(year, month - 1, day).getDay();
                  const isWeekend = weekday === 0 || weekday === 6;
                  let cls = "border bg-background";
                  if (row?.kind === "HOLIDAY_OFF") cls = "border-orange-300 bg-orange-50";
                  if (row?.kind === "MAKEUP_WORKDAY") cls = "border-blue-300 bg-blue-50";
                  if (!row && isWeekend) cls = "border bg-muted/40";
                  return (
                    <button
                      key={dayKey}
                      type="button"
                      disabled={pending}
                      title={
                        row
                          ? `${row.kind} · ${row.source}${row.name ? ` · ${row.name}` : ""}\n点击：放假→调休→清除`
                          : "点击设为放假"
                      }
                      className={`h-8 rounded text-xs ${cls}`}
                      onClick={() => {
                        if (!row) setDay(dayKey, "HOLIDAY_OFF");
                        else if (row.kind === "HOLIDAY_OFF") setDay(dayKey, "MAKEUP_WORKDAY");
                        else setDay(dayKey, "CLEAR");
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        图例：橙色=放假，蓝色=调休上班，灰底=普通周末。点击循环：放假 → 调休上班 → 清除手工（恢复自动/默认）。
      </p>
    </div>
  );
}
