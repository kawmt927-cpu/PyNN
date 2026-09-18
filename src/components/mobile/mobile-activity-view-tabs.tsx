"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  view: "day" | "week";
  selectedDate?: string;
  open?: string | null;
  className?: string;
};

/** 工作日志：按日 / 本周切换 */
export function MobileActivityViewTabs({
  view,
  selectedDate,
  open,
  className,
}: Props) {
  function hrefFor(next: "day" | "week") {
    const params = new URLSearchParams();
    params.set("view", next);
    if (next === "day" && selectedDate) params.set("date", selectedDate);
    if (open) params.set("open", open);
    return `/mobile/activity?${params.toString()}`;
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Link
        href={hrefFor("day")}
        className={cn(
          "rounded-full px-3 py-1 text-xs",
          view === "day" ? "bg-primary text-primary-foreground" : "border"
        )}
      >
        按日
      </Link>
      <Link
        href={hrefFor("week")}
        className={cn(
          "rounded-full px-3 py-1 text-xs",
          view === "week" ? "bg-primary text-primary-foreground" : "border"
        )}
      >
        本周
      </Link>
    </div>
  );
}
