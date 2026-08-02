"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatLogDateParam,
  getTodayLogDate,
} from "@/lib/sales-log/daily-log";

type Props = {
  value: string;
  onChange: (date: string) => void;
  /** yyyy-MM-dd，不设则不限制最早日期 */
  min?: string;
  /** yyyy-MM-dd，默认今天 */
  max?: string;
  className?: string;
};

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return formatLogDateParam(new Date(y, m - 1, d + deltaDays));
}

function formatDisplayDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 日历选日 + 前一天 / 后一天（两行布局，避免原生 date 控件挤掉按钮） */
export function MobileDateNav({
  value,
  onChange,
  min,
  max,
  className,
}: Props) {
  const maxDate = max ?? formatLogDateParam(getTodayLogDate());
  const canPrev = !min || value > min;
  const canNext = value < maxDate;

  function goPrev() {
    if (!canPrev) return;
    const next = shiftYmd(value, -1);
    if (min && next < min) return;
    onChange(next);
  }

  function goNext() {
    if (!canNext) return;
    const next = shiftYmd(value, 1);
    if (next > maxDate) return;
    onChange(next);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <label className="relative block">
        <span className="sr-only">选择日期</span>
        <div className="flex h-10 items-center justify-center rounded-lg border border-input bg-background px-3 text-sm font-medium tabular-nums">
          {formatDisplayDate(value)}
        </div>
        <input
          type="date"
          value={value}
          min={min}
          max={maxDate}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            if (min && next < min) return;
            if (next > maxDate) return;
            onChange(next);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="打开日历选择日期"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-1 rounded-lg border text-sm font-medium",
            canPrev
              ? "border-border bg-background active:bg-muted"
              : "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          前一天
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-1 rounded-lg border text-sm font-medium",
            canNext
              ? "border-border bg-background active:bg-muted"
              : "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground"
          )}
        >
          后一天
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
