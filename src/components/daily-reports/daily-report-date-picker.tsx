"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value: string;
  maxDate: string;
  userId: string;
  initialMarkedDates?: string[];
  markLegendLabel?: string;
  onChange: (date: string) => void;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function DailyReportDatePicker({
  value,
  maxDate,
  userId,
  initialMarkedDates = [],
  markLegendLabel = "当日有日报或工作记录",
  onChange,
}: Props) {
  const selected = useMemo(() => parseISO(value), [value]);
  const max = useMemo(() => parseISO(maxDate), [maxDate]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected));
  const [markedDates, setMarkedDates] = useState<Set<string>>(
    () => new Set(initialMarkedDates)
  );

  useEffect(() => {
    setMarkedDates(new Set(initialMarkedDates));
    setViewMonth(startOfMonth(parseISO(value)));
  }, [userId, initialMarkedDates, value]);

  const loadMarked = useCallback(
    async (month: Date) => {
      const year = month.getFullYear();
      const monthNum = month.getMonth() + 1;
      const params = new URLSearchParams({
        userId,
        year: String(year),
        month: String(monthNum),
      });
      try {
        const res = await fetch(`/api/daily-reports/marked-days?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as { dates?: string[] };
        setMarkedDates((prev) => {
          const next = new Set(prev);
          for (const d of data.dates ?? []) next.add(d);
          return next;
        });
      } catch {
        // 标记加载失败不阻断选日期
      }
    },
    [userId]
  );

  useEffect(() => {
    void loadMarked(startOfMonth(parseISO(value)));
  }, [userId, value, loadMarked]);

  useEffect(() => {
    if (!open) return;
    void loadMarked(viewMonth);
  }, [open, viewMonth, loadMarked]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  function pickDay(day: Date) {
    if (isAfter(day, max)) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  }

  const displayLabel = format(selected, "yyyy/MM/dd", { locale: zhCN });

  return (
    <div className="min-w-[160px] flex-1 space-y-1.5 sm:max-w-[200px]">
      <Label className="text-xs text-muted-foreground">日期</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-10 w-full justify-between px-3 font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <span>{displayLabel}</span>
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-3" align="start">
          <div className="mb-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              {format(viewMonth, "yyyy年 M月", { locale: zhCN })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isSameMonth(viewMonth, max)}
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, viewMonth);
              const isSelected = isSameDay(day, selected);
              const isFuture = isAfter(day, max);
              const hasMark = markedDates.has(key);

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isFuture}
                  onClick={() => pickDay(day)}
                  className={cn(
                    "relative flex h-9 flex-col items-center justify-center rounded-md text-sm transition-colors",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && !isFuture && "hover:bg-accent",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                    isFuture && "cursor-not-allowed opacity-40"
                  )}
                >
                  <span>{format(day, "d")}</span>
                  {hasMark && inMonth ? (
                    <span
                      className={cn(
                        "absolute bottom-0.5 h-1 w-1 rounded-full",
                        isSelected ? "bg-primary-foreground" : "bg-primary"
                      )}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            <span className="mr-1 inline-block h-1 w-1 rounded-full bg-primary align-middle" />
            {markLegendLabel}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
